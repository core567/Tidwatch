"""领域枚举常量。Python 用 snake 风格模块，落库/JSON 使用这些稳定字符串值。"""
from __future__ import annotations

import enum


class SourceType(str, enum.Enum):
    OFFICIAL_PUBLIC = "OFFICIAL_PUBLIC"
    SIMULATED = "SIMULATED"
    EXTERNAL = "EXTERNAL"
    RULE_OUTPUT = "RULE_OUTPUT"
    MODEL_OUTPUT = "MODEL_OUTPUT"
    MANUAL = "MANUAL"


class QualityFlag(str, enum.Enum):
    GOOD = "GOOD"
    SUSPECT = "SUSPECT"
    INVALID = "INVALID"
    MISSING = "MISSING"
    STALE = "STALE"


class EventStatus(str, enum.Enum):
    OPEN = "OPEN"
    INVESTIGATING = "INVESTIGATING"
    MONITORING = "MONITORING"
    ESCALATED = "ESCALATED"
    NARROWED = "NARROWED"
    RECOVERY_PENDING = "RECOVERY_PENDING"
    RECOVERED = "RECOVERED"
    UNRESOLVED = "UNRESOLVED"


# 终态以外均视为活动事件
ACTIVE_EVENT_STATUSES: frozenset[EventStatus] = frozenset(
    {
        EventStatus.OPEN,
        EventStatus.INVESTIGATING,
        EventStatus.MONITORING,
        EventStatus.ESCALATED,
        EventStatus.NARROWED,
        EventStatus.RECOVERY_PENDING,
    }
)


class ReachRole(str, enum.Enum):
    UPSTREAM = "upstream"
    MIDSTREAM = "midstream"
    DOWNSTREAM = "downstream"


class ReachOnlineStatus(str, enum.Enum):
    ONLINE = "ONLINE"
    STALE = "STALE"
    OFFLINE = "OFFLINE"


class CoordinateStatus(str, enum.Enum):
    LOGICAL = "LOGICAL"
    VERIFIED = "VERIFIED"


class UserRole(str, enum.Enum):
    ADMIN = "admin"
    ANALYST = "analyst"
    INSPECTOR = "inspector"


class TaskStatus(str, enum.Enum):
    PENDING = "PENDING"
    ACCEPTED = "ACCEPTED"
    IN_PROGRESS = "IN_PROGRESS"
    SUBMITTED = "SUBMITTED"
    CANCELLED = "CANCELLED"


class TaskActionType(str, enum.Enum):
    CONTINUE_OBSERVE = "CONTINUE_OBSERVE"
    FOCUS_REACH_B = "FOCUS_REACH_B"
    FOCUS_REACH_C = "FOCUS_REACH_C"
    KEEP_LOCAL_SCOPE = "KEEP_LOCAL_SCOPE"
    INSPECT_DATA_LINK = "INSPECT_DATA_LINK"
    MANUAL_CHECK = "MANUAL_CHECK"
    RE_EVALUATE_AFTER_RECOVERY = "RE_EVALUATE_AFTER_RECOVERY"


class EvidenceType(str, enum.Enum):
    OBSERVATION = "OBSERVATION"
    EXTERNAL = "EXTERNAL"
    RULE = "RULE"
    MODEL = "MODEL"
    MANUAL = "MANUAL"
    KNOWLEDGE = "KNOWLEDGE"


class Polarity(str, enum.Enum):
    SUPPORT = "SUPPORT"
    COUNTER = "COUNTER"
    MISSING = "MISSING"


class HypothesisState(str, enum.Enum):
    OPEN = "OPEN"
    PARTIAL_SUPPORT = "PARTIAL_SUPPORT"
    SUPPORT = "SUPPORT"
    NOT_SUPPORT = "NOT_SUPPORT"
    UNKNOWN = "UNKNOWN"
