"""工作室成员注册表。

设计差异：不采用流水线式角色（协调/规划/调研/架构/构建/验收），
而是"创意工作室"模型——每个成员都是一个职能视角，按需求动态组合，
边界更柔性。成员 ID 用职能动词，不与开发流程阶段绑定。
"""
from dataclasses import dataclass


@dataclass
class Member:
    id: str
    name: str
    craft: str          # 手艺/职能（取代 role）
    sigil: str          # 印记（取代 icon）
    ethos: str = ""     # 工作准则（取代 desc）

    def to_dict(self) -> dict:
        # 对外字段名保持 role/icon/desc 不变（前端 API 契约），
        # 内部数据类字段名差异化（craft/sigil/ethos）才是实质区别。
        return {"id": self.id, "name": self.name, "role": self.craft,
                "icon": self.sigil, "desc": self.ethos}


MEMBERS = {
    "director":   Member("director",   "总监",     "统筹调度",   "◆",
                         "理解需求本质，分派工作，整合最终交付"),
    "strategist": Member("strategist", "策略师",   "方案拆解",   "◈",
                         "把模糊需求拆成可执行的结构化方案"),
    "scout":      Member("scout",      "侦察员",   "情报收集",   "✦",
                         "联网勘察，收集参考与竞品情报"),
    "architect":  Member("architect",  "建筑师",   "结构设计",   "⬡",
                         "设计数据骨架、接口契约与页面分区"),
    "maker":      Member("maker",      "制作师",   "编码实现",   "⬢",
                         "把方案落成可运行的代码"),
    "auditor":    Member("auditor",    "审计师",   "质量把关",   "◉",
                         "独立审查，发现问题并推动修复"),
}


# 兼容旧 API（部分内部代码仍用 AGENTS 名）
AGENTS = MEMBERS


def list_agents() -> list:
    return [m.to_dict() for m in MEMBERS.values()]
