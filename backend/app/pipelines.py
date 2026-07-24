"""三种委托模式 = 三条工作流。

设计差异：
- sketch（速绘）：单成员直接出活，适合原型/简单页
- workshop（工坊）：总监分诊后动态展开多成员协作
- expedition（考察）：先出调研报告，关卡处决定是否转交付物

Node 字段重命名：agent→lead, output→deliverable, input_from→depends_on,
kind→mode, gate→checkpoint, parallel_group→squad。
"""
from dataclasses import dataclass
from typing import List, Union


@dataclass
class Task:
    lead: str                                   # 主责成员
    deliverable: str                            # 交付物标识
    depends_on: Union[str, List[str]] = "user"  # 依赖来源
    mode: str = "run"                           # run | triage
    checkpoint: bool = False                    # True = 完成后暂停等用户确认
    squad: str = ""                             # 并行小组标识


WORKFLOWS = {
    "sketch": [
        Task(lead="maker", deliverable="code", depends_on="user"),
    ],
    "workshop": [
        Task(lead="director", deliverable="route", mode="triage"),
    ],
    "expedition": [
        Task(lead="scout", deliverable="report", depends_on="user"),
        Task(lead="maker", deliverable="code", depends_on="report", checkpoint=True),
    ],
}


def workshop_tasks_after_triage(complexity: str) -> list:
    """工坊模式分诊后按复杂度展开任务。"""
    if complexity == "simple":
        return [Task(lead="maker", deliverable="code"),
                Task(lead="auditor", deliverable="review")]
    return [
        Task(lead="strategist", deliverable="brief", squad="discovery"),
        Task(lead="scout", deliverable="report", squad="discovery"),
        Task(lead="architect", deliverable="blueprint", depends_on=["brief", "report"]),
        Task(lead="maker", deliverable="code"),
        Task(lead="auditor", deliverable="review"),
    ]


MODES = [
    {"id": "sketch", "name": "速绘", "sigil": "✏️",
     "members": ["maker"], "desc": "单成员直接出活，适合原型 / 简单页"},
    {"id": "workshop", "name": "工坊", "sigil": "🏗",
     "members": ["director", "strategist", "scout", "architect", "maker", "auditor"],
     "desc": "总监分诊 → 策略/侦察并行 → 建筑 → 制作 → 审计"},
    {"id": "expedition", "name": "考察", "sigil": "🧭",
     "members": ["scout", "maker"], "desc": "先出调研报告，关卡处决定是否转交付物"},
]


def get_modes() -> list:
    """返回模式列表，每个模式带上其成员的完整信息。"""
    from app.agents import MEMBERS
    out = []
    for m in MODES:
        item = dict(m)
        item["agent_details"] = [
            MEMBERS[mid].to_dict() for mid in m["members"] if mid in MEMBERS
        ]
        out.append(item)
    return out


def task_to_dict(t: Task, status: str = "pending") -> dict:
    return {
        "lead": t.lead, "deliverable": t.deliverable, "depends_on": t.depends_on,
        "mode": t.mode, "checkpoint": t.checkpoint, "squad": t.squad,
        "status": status,
    }


def dict_to_task(d: dict) -> Task:
    return Task(
        lead=d["lead"], deliverable=d["deliverable"],
        depends_on=d.get("depends_on", "user"),
        mode=d.get("mode", "run"), checkpoint=d.get("checkpoint", False),
        squad=d.get("squad", ""),
    )


# ---------------------------------------------------------------- 兼容别名
# 旧代码（orchestrator/store 等）仍用 Node/PIPELINES/team_nodes_after_triage
# 等名字，这里保留别名避免大面积同步修改引入 bug。字段名差异才是实质区别。
Node = Task
PIPELINES = WORKFLOWS
node_to_dict = task_to_dict
dict_to_node = dict_to_task
team_nodes_after_triage = workshop_tasks_after_triage
