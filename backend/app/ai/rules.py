"""规则意图路由（确定性基础层，不依赖大模型）。

把中文问题映射到只读业务工具，并把工具返回组织成带来源/时间/质量的中文回答。
无法识别意图时返回 need_llm，交由上层：配置了大模型则走大模型，否则给出引导。
"""
from __future__ import annotations

import re
from typing import Any

from sqlalchemy.orm import Session

from .tools import run_tool

REACH_ALIAS = {
    "上游": "reach-a", "上游a": "reach-a", "上游 a": "reach-a", "a站": "reach-a", "a断面": "reach-a",
    "中游": "reach-b", "中游b": "reach-b", "b站": "reach-b", "b断面": "reach-b",
    "下游": "reach-c", "下游c": "reach-c", "c站": "reach-c", "c断面": "reach-c",
}
REACH_ID = {"reach-a": "上游 A", "reach-b": "中游 B", "reach-c": "下游 C"}
METRIC_CN = {"waterLevel": "水位", "turbidity": "浊度", "flowLevel": "水流等级"}
EVENT_RE = re.compile(r"TW-?\d+", re.IGNORECASE)

# 动作意图（写操作）：H1 只提示，不执行
WRITE_HINT = {
    "派发": "任务派发属于写操作，请在「研判工作台 → 处置建议」中人工确认后执行。",
    "审核": "复核操作请在「巡检协同中心」打开任务详情，人工确认通过或退回。",
    "复核": "复核操作请在「巡检协同中心」打开任务详情，人工确认通过或退回。",
    "关闭": "事件关闭必须经状态机的合法人工操作，助手不能代为执行。",
}


class RuleResult:
    def __init__(self, answer: str, tools: list[dict], mode: str = "rule",
                 need_llm: bool = False, suggested_commands: list[dict] | None = None,
                 warnings: list[str] | None = None, refs: dict | None = None):
        self.answer = answer
        self.tools = tools
        self.mode = mode
        self.need_llm = need_llm
        self.suggested_commands = suggested_commands or []
        self.warnings = warnings or []
        self.refs = refs or {}

    def to_dict(self) -> dict:
        return {
            "answer": self.answer,
            "mode": self.mode,
            "toolsUsed": [t.get("tool") for t in self.tools if t.get("tool")],
            "toolResults": self.tools,
            "needLlm": self.need_llm,
            "suggestedCommands": self.suggested_commands,
            "warnings": self.warnings,
            "refs": self.refs,
        }


def _find_reach(text: str) -> str | None:
    t = text.lower().replace(" ", "")
    for alias, rid in REACH_ALIAS.items():
        if alias.replace(" ", "") in t:
            return rid
    m = re.search(r"reach-?[abc]", t)
    return f"reach-{m.group()[-1]}" if m else None


def _fmt_quality(qf: str | None) -> str:
    return "质量良好" if qf in ("GOOD", None) else f"质量 {qf}"


def answer(db: Session, message: str) -> RuleResult:
    text = message.strip()
    low = text.lower()

    # 0. 写操作意图 → 只给安全引导
    for kw, hint in WRITE_HINT.items():
        if kw in text:
            return RuleResult(
                "我不能直接执行业务写操作。" + hint,
                tools=[],
                suggested_commands=[],
                warnings=["写操作需人工确认，AI 不直接执行"],
            )

    event_id_match = EVENT_RE.search(text)
    event_id = event_id_match.group(0).upper().replace("TW-", "TW-") if event_id_match else None
    if event_id and "-" not in event_id:
        event_id = event_id.replace("TW", "TW-")

    # 1. 恢复评估
    if event_id and ("恢复" in text or "评估" in text):
        r = run_tool(db, "recovery_assessment", {"eventId": event_id})
        if "error" in r:
            return RuleResult(r["error"], [r])
        d = r["data"]
        ans = (
            f"{event_id} 恢复评估（{d['ruleVersion']}）：{d['label']}。\n"
            f"事件当前业务状态：{d['currentStatus']}（与评估结论相互独立）。\n"
            f"时间锚点：{d['anchor']['note']}"
            + (f"（{d['anchor']['at']}）" if d["anchor"]["at"] else "（缺失）") + "。\n"
            + "因子：" + "；".join(
                f"{f['code']}={'通过' if f['passed'] is True else ('不满足' if f['passed'] is False else '信息不足')}"
                for f in d["factors"]
            ) + "。"
        )
        return RuleResult(ans, [r], refs={"eventId": event_id})

    # 2. 事件状态/详情
    if event_id and ("事件" in text or "状态" in text or "情况" in text or "为什么" in text or "详情" in text):
        r = run_tool(db, "event_detail", {"eventId": event_id})
        if "error" in r:
            return RuleResult(r["error"], [r])
        d = r["data"]
        ans = (
            f"{event_id}「{d['title']}」当前状态：{d['status']}，优先级 {d['priority']}；"
            f"关联任务 {len(d['tasks'])} 个，开放盲区 {len(d['openBlindspots'])} 个。"
            "规则评估、时间线与提交版本请在复盘详情查看。"
        )
        return RuleResult(ans, [r], refs={"eventId": event_id})

    # 3. 未处理任务
    if "任务" in text and ("未处理" in text or "未完成" in text or "待办" in text or "哪些" in text or "有哪些" in text):
        r = run_tool(db, "list_tasks", {})
        if "error" in r:
            return RuleResult(r["error"], [r])
        items = r["data"]
        open_items = [x for x in items if x["status"] not in ("APPROVED", "CANCELLED")]
        if not open_items:
            return RuleResult("当前没有未完成的巡检任务。", [r])
        lines = [f"- {x['title']}（{x['taskId']}，状态 {x['status']}）" for x in open_items[:10]]
        return RuleResult(f"当前未完成任务 {len(open_items)} 个：\n" + "\n".join(lines), [r],
                          refs={"taskIds": [x["taskId"] for x in open_items]})

    # 4. 异常断面
    if "异常" in text and ("断面" in text or "哪些" in text or "哪里" in text):
        r = run_tool(db, "anomalies", {})
        data = r["data"]
        if not data:
            return RuleResult("当前没有进行中的异常断面。", [r])
        lines = [f"- {REACH_ID.get(x['reachId'], x['reachId'])}：关联事件 {', '.join(x['events'])}" for x in data]
        return RuleResult("当前存在异常的断面：\n" + "\n".join(lines), [r])

    # 5. 未读告警（基础层只说明入口，不直连通知表）
    if "告警" in text or "通知" in text:
        return RuleResult(
            "未读告警可点击顶栏铃铛查看；通知由事件状态、任务与盲区变化实时推送。",
            [],
            suggested_commands=[{"type": "navigate", "to": "/events"}],
        )

    # 6. 断面最新值 / 水位
    reach = _find_reach(text)
    if reach and ("水位" in text or "浊度" in text or "水流" in text or "多少" in text or "当前" in text or "最新" in text or "值" in text):
        r = run_tool(db, "reach_latest", {"reachId": reach})
        if "error" in r:
            return RuleResult(r["error"], [r])
        data = r["data"]
        if not data:
            return RuleResult(f"{REACH_ID[reach]} 当前无有效观测（可能未接入或缺测）。", [r],
                              warnings=["该断面无最新观测"])
        lines = []
        for m in data:
            name = METRIC_CN.get(m["metric"], m["metric"])
            t = m["observedAt"][:16].replace("T", " ") if m["observedAt"] else "—"
            lines.append(f"- {name}：{m['value']} {m['unit']}（{t}，{_fmt_quality(m['qualityFlag'])}，来源 {m['sourceType']}）")
        return RuleResult(f"{REACH_ID[reach]} 最新观测：\n" + "\n".join(lines), [r],
                          refs={"reachId": reach})

    # 7. 兜底：列出事件
    if "事件" in text:
        r = run_tool(db, "list_events", {"limit": 10})
        items = r["data"]
        if not items:
            return RuleResult("当前没有事件记录。", [r])
        lines = [f"- {x['eventId']}「{x['title']}」{x['status']}" for x in items[:10]]
        return RuleResult("最近事件：\n" + "\n".join(lines), [r])

    # 无法用规则确定
    return RuleResult(
        "基础助手模式：我可以查询断面最新水位/浊度、异常断面、事件状态、未完成任务与恢复评估。"
        "更复杂的分析需要配置大模型（AI_ENABLED/AI_API_KEY/AI_BASE_URL/AI_MODEL）。",
        [],
        need_llm=True,
    )
