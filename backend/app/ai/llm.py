"""OpenAI 兼容大模型适配层（仅当 settings.ai_configured 时启用）。

- stdlib urllib，不引入新依赖；
- 受控工具：模型只能调用 app.ai.tools.REGISTRY 中的只读工具，参数经校验；
- 工具调用轮次/输出长度/超时受限；
- 任何失败（连接/超时/非 200/不支持工具调用）都抛出 LLMError，由上层降级为规则模式。
"""
from __future__ import annotations

import json
import urllib.error
import urllib.request
from typing import Any

from sqlalchemy.orm import Session

from app.core.config import settings
from .tools import REGISTRY, run_tool


class LLMError(RuntimeError):
    pass


def tool_specs() -> list[dict]:
    return [
        {
            "type": "function",
            "function": {
                "name": t.name,
                "description": t.description,
                "parameters": {
                    "type": "object",
                    "properties": {
                        "reachId": {"type": "string", "description": "断面 ID，如 reach-a/reach-b/reach-c"},
                        "eventId": {"type": "string", "description": "事件 ID，如 TW-001"},
                        "status": {"type": "string", "description": "可选状态过滤"},
                    },
                },
            },
        }
        for t in REGISTRY.values()
    ]


SYSTEM_PROMPT = (
    "你是 TideWatch 智慧河流水环境监测系统的助手。只能依据工具返回的真实业务数据回答，"
    "不得编造数值、事件原因或恢复结论。回答需区分：已确认事实、规则评估结果、可能假设、缺失证据。"
    "MQTT 模拟观测与官方实时快照是不同来源，必须如实标注；不要把模拟数据称为官方实测。"
    "不得执行或建议绕过审批的写操作；任务派发/复核/关闭需引导用户到对应页面人工确认。"
    "用简洁中文回答，并在末尾给出数据来源与时间。"
)


def _post_chat(payload: dict) -> dict:
    url = settings.ai_base_url.rstrip("/")
    if not url.endswith("/chat/completions"):
        url = f"{url}/chat/completions"
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {settings.ai_api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=settings.ai_timeout_seconds) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "ignore")[:300]
        raise LLMError(f"模型接口返回 {e.code}: {body}") from e
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        raise LLMError(f"无法连接模型服务：{e}") from e


def _extract_tool_calls(message: dict) -> list[dict]:
    calls = message.get("tool_calls") or []
    out = []
    for c in calls:
        fn = c.get("function") or {}
        try:
            args = json.loads(fn.get("arguments") or "{}")
        except json.JSONDecodeError:
            args = {}
        out.append({"id": c.get("id"), "name": fn.get("name"), "args": args if isinstance(args, dict) else {}})
    return out


def chat(db: Session, message: str) -> dict:
    """工具调用循环；返回正文与实际调用的工具结果。失败抛 LLMError。"""
    messages: list[dict] = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": message},
    ]
    tools_used: list[dict] = []

    for _round in range(max(1, settings.ai_max_tool_rounds)):
        payload = {
            "model": settings.ai_model,
            "messages": messages,
            "tools": tool_specs(),
            "tool_choice": "auto",
            "max_tokens": settings.ai_max_output_tokens,
            "temperature": 0.2,
        }
        resp = _post_chat(payload)
        try:
            choice = resp["choices"][0]["message"]
        except (KeyError, IndexError) as e:
            raise LLMError(f"模型响应结构异常：{str(resp)[:200]}") from e

        calls = _extract_tool_calls(choice)
        if not calls:
            return {
                "answer": choice.get("content") or "（模型未返回内容）",
                "toolsUsed": [t.get("tool") for t in tools_used if t.get("tool")],
                "toolResults": tools_used,
                "model": resp.get("model", settings.ai_model),
            }

        # 把助手的工具请求与工具结果都加入上下文
        messages.append(choice)
        for call in calls:
            name, args = call["name"], call["args"]
            if name not in REGISTRY:
                # 模型请求了未注册工具：明确拒绝并反馈，不执行任意代码
                result = {"error": f"未授权或不存在的工具：{name}"}
            else:
                # 参数白名单：只透传注册表工具认识的键
                allowed = {"reachId", "eventId", "status", "limit"}
                safe_args = {k: v for k, v in args.items() if k in allowed and v is not None}
                result = run_tool(db, name, safe_args)
            tools_used.append(result)
            messages.append({"role": "tool", "tool_call_id": call["id"], "content": json.dumps(result, ensure_ascii=False)})

    raise LLMError("达到最大工具调用轮次仍未给出最终回答")


def model_supports_tools() -> bool:
    """轻量探测：列出模型或一次最小请求确认工具调用能力（失败不影响规则模式）。"""
    try:
        resp = _post_chat({
            "model": settings.ai_model,
            "messages": [{"role": "user", "content": "ping"}],
            "max_tokens": 1,
            "tools": tool_specs(),
        })
        return "choices" in resp
    except LLMError:
        return False
