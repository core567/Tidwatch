"""聚合导入全部 ORM 模型，供 Base.metadata 与 Alembic 使用。"""
from app.models.base import Base, TimestampMixin, utc_now
from app.models.evidence import Evidence, Hypothesis
from app.models.event import (
    ActiveEvent,
    ChangeEvent,
    EventScope,
    EventStatusTransition,
    TemporalRelation,
)
from app.models.focus import BlindSpot, ObservationFocus
from app.models.ingestion import IngestionError, ProcessedMessage
from app.models.observation import (
    Attachment,
    ImportBatch,
    Observation,
    OfficialAutoFetch,
    OfficialAutoRecord,
    OfficialMonthlyRecord,
)
from app.models.reach import MetricDictionary, Reach
from app.models.system import (
    KnowledgeEntry,
    ModelOutput,
    RuleConfig,
    ScenarioRun,
    User,
)
from app.models.workflow import (
    Assessment,
    EventReview,
    InspectionTask,
    RunTrace,
)

__all__ = [
    "Base",
    "TimestampMixin",
    "utc_now",
    "Reach",
    "MetricDictionary",
    "Observation",
    "ImportBatch",
    "OfficialMonthlyRecord",
    "OfficialAutoRecord",
    "OfficialAutoFetch",
    "Attachment",
    "ChangeEvent",
    "ActiveEvent",
    "EventScope",
    "EventStatusTransition",
    "TemporalRelation",
    "Evidence",
    "Hypothesis",
    "ObservationFocus",
    "BlindSpot",
    "ProcessedMessage",
    "IngestionError",
    "InspectionTask",
    "Assessment",
    "RunTrace",
    "EventReview",
    "User",
    "RuleConfig",
    "ScenarioRun",
    "ModelOutput",
    "KnowledgeEntry",
]
