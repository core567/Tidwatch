"""变化检测规则测试：去抖确认、确认/恢复边沿、窗口、S1 不产生异常。"""
from __future__ import annotations

from app.rules.change_detection import (
    ChangeDetector,
    ChangeRuleParams,
    Sample,
)
from app.rules.thresholds import EnvStatus


def feed(detector, points: list[tuple[float, float, float]]) -> list:
    return [
        detector.add(Sample(observed_at=t, water_level=wl, turbidity=tu))
        for t, wl, tu in points
    ]


def test_stable_baseline_no_change():
    d = ChangeDetector()
    res = feed(d, [(i, 4.5, 20.0) for i in range(60)])
    assert all(r.status is EnvStatus.NORMAL for r in res)
    assert all(not r.confirmed for r in res)
    assert all(not r.confirmed_now and not r.recovered_now for r in res)


def test_single_spike_not_confirmed():
    d = ChangeDetector()
    feed(d, [(0, 4.5, 20.0), (1, 4.5, 20.0)])
    r = d.add(Sample(2, 9.0, 20.0))
    assert r.status is EnvStatus.FLOOD_WARNING
    assert r.confirmed is False and r.confirmed_now is False
    assert r.abnormal_run == 1


def test_consecutive_abnormal_emits_confirmed_edge_once():
    d = ChangeDetector()
    feed(d, [(0, 4.5, 20.0)])
    r1 = d.add(Sample(1, 9.0, 20.0))
    r2 = d.add(Sample(2, 9.1, 20.0))
    r3 = d.add(Sample(3, 9.2, 20.0))
    assert not r1.confirmed
    assert r2.confirmed and r2.confirmed_now  # 边沿只在确认当帧
    assert r3.confirmed and not r3.confirmed_now
    assert r2.started_at == 1.0


def test_turbidity_change_confirmed():
    d = ChangeDetector()
    feed(d, [(0, 4.5, 20.0)])
    r1 = d.add(Sample(1, 4.5, 75.0))
    r2 = d.add(Sample(2, 4.5, 78.0))
    assert not r1.confirmed
    assert r2.confirmed and r2.status is EnvStatus.TURBIDITY_HIGH


def test_confirmed_state_survives_isolated_normal_point():
    """已确认异常后，单个正常点不应立即恢复（D3：必须满足恢复窗口）。"""
    d = ChangeDetector()
    feed(d, [(0, 4.5, 20.0), (1, 9.0, 20.0), (2, 9.0, 20.0)])
    assert d.add(Sample(3, 9.0, 20.0)).confirmed
    r_normal1 = d.add(Sample(4, 4.5, 20.0))
    r_normal2 = d.add(Sample(5, 4.5, 20.0))
    assert r_normal1.confirmed and not r_normal1.recovered_now
    assert r_normal2.confirmed and not r_normal2.recovered_now
    # 第 3 个连续正常点才恢复
    r_recovered = d.add(Sample(6, 4.5, 20.0))
    assert r_recovered.status is EnvStatus.NORMAL
    assert not r_recovered.confirmed
    assert r_recovered.recovered_now is True


def test_re_abnormal_during_recovery_keeps_confirmed():
    d = ChangeDetector()
    feed(d, [(0, 4.5, 20.0), (1, 9.0, 20.0), (2, 9.0, 20.0)])  # 确认
    d.add(Sample(3, 4.5, 20.0))
    d.add(Sample(4, 4.5, 20.0))  # 两个正常点
    r = d.add(Sample(5, 9.0, 20.0))  # 再次异常，连续正常中断
    assert r.confirmed and not r.recovered_now


def test_intermittent_spike_does_not_confirm():
    d = ChangeDetector()
    seq = [(0, 4.5, 20), (1, 9.0, 20), (2, 4.5, 20), (3, 9.0, 20), (4, 4.5, 20)]
    assert all(not r.confirmed for r in feed(d, seq))


def test_window_expiry_forgets_old_abnormal():
    params = ChangeRuleParams(window_seconds=10)
    d = ChangeDetector(params)
    d.add(Sample(0, 9.0, 20.0))
    d.add(Sample(11, 4.5, 20.0))  # 旧异常滑出窗口
    r = d.add(Sample(12, 9.0, 20.0))
    assert r.abnormal_run == 1 and not r.confirmed


def test_custom_confirm_threshold():
    d = ChangeDetector(ChangeRuleParams(confirm_samples_water=3, confirm_samples_turbidity=3))
    feed(d, [(0, 4.5, 20)])
    d.add(Sample(1, 9.0, 20))
    assert not d.add(Sample(2, 9.0, 20)).confirmed
    assert d.add(Sample(3, 9.0, 20)).confirmed
