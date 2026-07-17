from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, Numeric, String, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    role: Mapped[str] = mapped_column(String(50), nullable=False, default="manager")
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    employees: Mapped[list["Employee"]] = relationship("Employee", back_populates="user", cascade="all, delete-orphan")


class Employee(Base):
    __tablename__ = "employees"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    position: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    grade: Mapped[str] = mapped_column(String(50), nullable=False, default="trainee", index=True)
    base_salary: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    bonus_percent: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False, default=0)
    service_factor: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False, default=0.5)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    user: Mapped["User"] = relationship("User", back_populates="employees")
    payrolls: Mapped[list["PayrollRecord"]] = relationship("PayrollRecord", back_populates="employee", cascade="all, delete-orphan")


class PayrollRecord(Base):
    __tablename__ = "payroll_records"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    employee_id: Mapped[int] = mapped_column(Integer, ForeignKey("employees.id", ondelete="CASCADE"), index=True, nullable=False)
    period: Mapped[str] = mapped_column(String(20), nullable=False)
    worked_days: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    working_days: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    service_margin: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    goods_margin: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    bonus_percent: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False, default=0)
    service_factor: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False, default=0.5)
    accrued_base: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    services_bonus: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    goods_bonus: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    bonus_total: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    tax_rate: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False, default=13.0)
    gross_pay: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    tax_amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    net_pay: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    employee: Mapped["Employee"] = relationship("Employee", back_populates="payrolls")