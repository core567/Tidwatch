"""AI 助手编排：分析类问题走大模型，明确的查询/操作走确定性规则。"""
from __future__ import annotations

from sqlalchemy.orm import Session

from app.core.config import settings
from . import rules
from .llm import LLMError, chat as llm_chat

# 明显需要语义理解/综合分析的意图：即使含“恢复/状态”等关键词，也优先交给大模型
ANALYSIS_HINTS = (
    "为什么", "分析", "研判", "解释", "总结", "建议", "怎么", "如何",
    "原因", "是否异常", "综合", "看法", "判断", "下一步",
)


def is_analysis_intent(message: str) -> bool:
    return any(h in message for h in ANALYSIS_HINTS)


def _llm_response(db: Session, message: str, fallback_rule) -> dict:
    try:
        llm = llm_chat(db, message)
        return {
            "answer": llm["answer"],
            "mode": "llm",
            "model": llm.get("model", settings.ai_model),
            "toolsUsed": llm.get("toolsUsed", []),
            "toolResults": llm.get("toolResults", []),
            "needLlm": False,
            "suggestedCommands": [],
            "warnings": [],
            "refs": {},
            "degraded": False,
        }
    except LLMError as e:
        base = fallback_rule.to_dict() if fallback_rule else {}
        base.update({
            "mode": "rule",
            "answer": f"（大模型暂不可用，已切换基础助手模式：{e}）\n\n{base.get('answer', '')}",
            "degraded": True,
        })
        return base


def respond(db: Session, message: str) -> dict:
    rule = rules.answer(db, message)

    # 配置了大模型时：分析类问题优先大模型；规则无法识别的兜底也走大模型
    if settings.ai_configured and (is_analysis_intent(message) or rule.need_llm):
        return _llm_response(db, message, rule)

    result = rule.to_dict()
    result["model"] = None
    result["degraded"] = False
    if not settings.ai_configured:
        result["warnings"] = list(result.get("warnings", [])) + [
            "当前为基础助手模式（未配置大模型 AI_API_KEY/AI_BASE_URL/AI_MODEL）。"
        ]
    return result
