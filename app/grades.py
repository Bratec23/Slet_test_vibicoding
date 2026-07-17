from typing import TypedDict


class Grade(TypedDict):
    id: str
    name: str
    base_salary: float
    bonus_percent: float
    service_factor: float
    has_plan: bool


GRADES: list[Grade] = [
    {
        "id": "trainee",
        "name": "Менеджер на испытательном сроке",
        "base_salary": 45000,
        "bonus_percent": 4.0,
        "service_factor": 0.5,
        "has_plan": False,
    },
]


def get_grade(grade_id: str) -> Grade | None:
    for g in GRADES:
        if g["id"] == grade_id:
            return g
    return None