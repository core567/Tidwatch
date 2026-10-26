"""AI 助手编排：优先大模型（已配置），失败/未配置自动降级到规则工具层。"""
from __future__ import annotations

from sqlalchemy.orm import Session

from app.core.config import settings
from . import rules
from .llm import LLMError, chat as llm_chat


def respond(db: Session, message: str) -> dict:
    # 第一层：确定性规则先尝试（导航/查询类直接命中，不必消耗大模型）
    rule = rules.answer(db, message)

    if settings.ai_configured and rule.need_llm:
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
            base = rule.to_dict()
            base.update({
                "mode": "rule",
                "answer": f"（大模型暂不可用，已切换基础助手模式：{e}）\n\n{base['answer']}",
                "degraded": True,
            })
            return base

    result = rule.to_dict()
    result["model"] = None
    result["degraded"] = settings.ai_configured and rule.need_llm
    if not settings.ai_configured:
        result["warnings"] = list(result.get("warnings", [])) + [
            "当前为基础助手模式（未配置大模型 AI_API_KEY/AI_BASE_URL/AI_MODEL）。"
        ]
    return result
