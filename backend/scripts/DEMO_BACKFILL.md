# 演示观测数据回填器

`scripts/seed_demo_observations.py`：为图表演示生成可控、可重置、幂等的最近 7 天 MQTT 模拟观测历史。

## 为什么需要

原有 MQTT 模拟器（`simulator/`）只在运行时推送"当下"数据，停止后数据库里只有短时间段观测，
导致 PC/小程序的近 1h/24h/7d 图表留白。本脚本以**历史回填**方式补齐连续背景数据，
与实时 MQTT 推送是两条独立路径。

## 命令

```bash
# 后端目录，用项目虚拟环境
.venv/Scripts/python.exe scripts/seed_demo_observations.py                  # 默认：近 7 天、10 分钟间隔、含异常/缺测
.venv/Scripts/python.exe scripts/seed_demo_observations.py --days 3 --interval-min 5
.venv/Scripts/python.exe scripts/seed_demo_observations.py --no-anomaly      # 只回填常规背景
.venv/Scripts/python.exe scripts/seed_demo_observations.py --reset           # 删除本脚本生成的全部回填
.venv/Scripts/python.exe scripts/seed_demo_observations.py --stats           # 查看回填统计
```

| 参数 | 默认 | 说明 |
|---|---|---|
| `--days` | 7 | 回填天数（相对当前时间往前） |
| `--interval-min` | 10 | 采样间隔（分钟） |
| `--seed` | 20261028 | 随机种子；同参数重跑序列完全一致 |
| `--no-anomaly` | 关 | 只生成常规波动，不嵌入异常上涨与缺测段 |
| `--reset` | — | 删除 `source_name=demo-backfill` 的记录后退出 |
| `--stats` | — | 仅打印回填数量统计 |

## 生成内容

- 三断面 A/B/C × 三指标（水位 m / 浊度 NTU / 水流等级 enum0-3，非真实流量）
- 各断面基线、噪声可配置（见脚本 `BASE_CFG`），带界随机游走 + 回归基线，非水平直线
- 近 ~30 小时内嵌入一段 S3 式异常：A 先、B 后、C 晚的水位"上涨→峰值→回落"
- 嵌入一段 S5 式缺测（reach-c 连续约 3 小时不生成任何指标，图表断线）

## 隔离与安全（重要）

- 直接写 `observations` 表，**不经过 MQTT/规则/事件服务**：不触发判级、不创建事件、
  不写业务时间线、不影响任何恢复评估（已验证事件数/审核记录回填前后不变）。
- 每条：`source_type='SIMULATED'`、`source_name='demo-backfill'`、
  `scenario_id='DEMO7D'`（常规）/`S3`/`S5`（异常、缺测段）。绝不写 OFFICIAL/MANUAL。
- `dedup_key` 确定性（含种子/断面/指标/序号），靠唯一约束 `uq_observation_dedup` 幂等：
  **重复运行只补缺、不叠加**；改参数会按新 dedup 生成（建议先 --reset）。
- `--reset` 只删 `source_name='demo-backfill'`，不触碰官方快照、人工复测、
  MQTT 实时入库与既有事件证据。
- 不修改系统时间，不伪造官方数据时间；实时数据仍由原 MQTT 链路（S1 等）流转。

## 配套改动

- 观测查询 `pageSize` 上限由 500 放宽到 5000（`app/api/routes_reaches.py`），
  使近 7 天 ~1000 点可一次取全；默认分页大小不变。
- 前端趋势查询使用 pageSize=2000，避免 asc 时被截断只显示最旧的 500 点。
