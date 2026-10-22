"""变化检测规则（demo-rules-v1 的一部分）。

在 M1 环境阈值判级（thresholds.py）之上识别“持续变化”：
连续 N 个采样点超阈值才确认异常（去抖），连续 M 个正常点才恢复。
纯函数式、不访问数据库，便于单测。事件服务依据 confirmed/recovered 边沿建/结事件。
"""
from __future__ import annotations

from dataclasses import dataclass

from app.rules.thresholds import DEMO_RULES_V1, EnvStatus, classify_environment


@dataclass(frozen=True)
class ChangeRuleParams:
    # 需要连续几个采样点维持异常才确认变化
    confirm_samples_water: int = 2
    confirm_samples_turbidity: int = 2
    # 变化窗口（秒）：窗口内的连续样本才计入
    window_seconds: float = 300.0
    # 恢复需要连续正常样本数
    recover_samples: int = 3


DEMO_CHANGE_RULES_V1 = ChangeRuleParams()


@dataclass
class Sample:
    """参与判级的一次多指标快照。"""

    observed_at: float  # epoch 秒
    water_level: float
    turbidity: float


@dataclass
class ChangeDetection:
    """单断面一次检测结果。

    status:        当前环境判级
    confirmed:     是否处于“已确认异常”状态（事件应活动）
    confirmed_now: 本 tick 是否由未确认→已确认（建事件边沿）
    recovered_now: 本 tick 是否由已确认异常→恢复正常（结事件边沿）
    abnormal_run:  当前连续异常样本数
    started_at:    本轮连续异常的最早样本时间
    """

    status: EnvStatus
    confirmed: bool = False
    confirmed_now: bool = False
    recovered_now: bool = False
    abnormal_run: int = 0
    started_at: float | None = None

    def to_dict(self) -> dict:
        return {
            "status": self.status.value,
            "confirmed": self.confirmed,
            "confirmedNow": self.confirmed_now,
            "recoveredNow": self.recovered_now,
            "abnormalRun": self.abnormal_run,
            "startedAt": self.started_at,
        }


def _is_water_abnormal(s: EnvStatus) -> bool:
    return s in (EnvStatus.FLOOD_WARNING, EnvStatus.WATER_LEVEL_WATCH)


class ChangeDetector:
    """对单断面维护滑动窗口与确认/恢复状态机。

    状态：正常 ↔ 未确认异常（连续异常但样本不足）↔ 已确认异常；
    已确认异常必须连续 recover_samples 个正常点才回到正常。
    """

    def __init__(
        self,
        params: ChangeRuleParams = DEMO_CHANGE_RULES_V1,
        env_params=DEMO_RULES_V1,
    ) -> None:
        self.params = params
        self.env_params = env_params
        self._window: list[Sample] = []
        self._confirmed_status: EnvStatus | None = None  # 已确认的异常类型

    def add(self, sample: Sample) -> ChangeDetection:
        self._window = [
            s
            for s in self._window
            if sample.observed_at - s.observed_at <= self.params.window_seconds
        ]
        self._window.append(sample)

        current = classify_environment(
            sample.water_level, sample.turbidity, self.env_params
        )
        water_run = self._trailing_run(
            lambda s: _is_water_abnormal(
                classify_environment(s.water_level, s.turbidity, self.env_params)
            )
        )
        turb_run = self._trailing_run(lambda s: classify_environment(
            s.water_level, s.turbidity, self.env_params
        ) is EnvStatus.TURBIDITY_HIGH)
        normal_run = self._trailing_run(lambda s: classify_environment(
            s.water_level, s.turbidity, self.env_params
        ) is EnvStatus.NORMAL)

        was_confirmed = self._confirmed_status is not None

        # 已确认异常：先判断是否满足恢复
        if was_confirmed:
            if normal_run >= self.params.recover_samples:
                recovered = self._confirmed_status
                self._confirmed_status = None
                return ChangeDetection(
                    status=EnvStatus.NORMAL,
                    confirmed=False,
                    recovered_now=True,
                    abnormal_run=0,
                )
            # 恢复观察期：若再次达到确认条件，保持/更新异常类型
            new_status = self._confirm_status(current, water_run, turb_run)
            if new_status is not None:
                self._confirmed_status = new_status
            # 维持已确认状态（即使最新点暂时正常，恢复样本不足也不结束）
            held = self._confirmed_status
            run = max(water_run, turb_run)
            return ChangeDetection(
                status=held if current is EnvStatus.NORMAL else current,
                confirmed=True,
                abnormal_run=run,
                started_at=self._abnormal_start(held),
            )

        # 未确认：达到连续阈值则确认
        new_status = self._confirm_status(current, water_run, turb_run)
        if new_status is not None:
            self._confirmed_status = new_status
            return ChangeDetection(
                status=new_status,
                confirmed=True,
                confirmed_now=True,
                abnormal_run=max(water_run, turb_run),
                started_at=self._abnormal_start(new_status),
            )

        # 未达确认：返回当前判级（可能是单点异常），但不确认
        if current is not EnvStatus.NORMAL:
            return ChangeDetection(
                status=current,
                confirmed=False,
                abnormal_run=max(water_run, turb_run, 1),
                started_at=self._abnormal_start(current),
            )
        return ChangeDetection(status=EnvStatus.NORMAL)

    def _confirm_status(
        self, current: EnvStatus, water_run: int, turb_run: int
    ) -> EnvStatus | None:
        if water_run >= self.params.confirm_samples_water:
            # 水位优先：回溯窗口内最近的水位异常判级
            for s in reversed(self._window):
                st = classify_environment(s.water_level, s.turbidity, self.env_params)
                if _is_water_abnormal(st):
                    return st
        if turb_run >= self.params.confirm_samples_turbidity:
            return EnvStatus.TURBIDITY_HIGH
        return None

    def _trailing_run(self, predicate) -> int:
        run = 0
        for s in reversed(self._window):
            if predicate(s):
                run += 1
            else:
                break
        return run

    def _abnormal_start(self, status: EnvStatus | None) -> float | None:
        if status is None:
            return None
        pred = (
            (lambda s: _is_water_abnormal(
                classify_environment(s.water_level, s.turbidity, self.env_params)
            ))
            if _is_water_abnormal(status)
            else (lambda s: classify_environment(
                s.water_level, s.turbidity, self.env_params
            ) is EnvStatus.TURBIDITY_HIGH)
        )
        started: float | None = None
        for s in reversed(self._window):
            if pred(s):
                started = s.observed_at
            else:
                break
        return started
