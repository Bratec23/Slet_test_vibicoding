from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Numeric, String, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class Department(Base):
    __tablename__ = "departments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    code: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    positions: Mapped[list["Position"]] = relationship("Position", back_populates="department", cascade="all, delete-orphan")
    users: Mapped[list["User"]] = relationship("User", back_populates="department")


class Position(Base):
    __tablename__ = "positions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    department_id: Mapped[int] = mapped_column(Integer, ForeignKey("departments.id", ondelete="CASCADE"), index=True, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    department: Mapped["Department"] = relationship("Department", back_populates="positions")
    users: Mapped[list["User"]] = relationship("User", back_populates="position")


class Grade(Base):
    __tablename__ = "grades"

    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    base_salary: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    bonus_percent: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False, default=0)
    service_factor: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False, default=0.5)
    has_plan: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    users: Mapped[list["User"]] = relationship("User", back_populates="grade")
    payrolls: Mapped[list["PayrollRecord"]] = relationship("PayrollRecord", back_populates="grade")


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    role: Mapped[str] = mapped_column(String(50), nullable=False, default="manager")
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)

    department_id: Mapped[int] = mapped_column(Integer, ForeignKey("departments.id"), index=True, nullable=False)
    position_id: Mapped[int] = mapped_column(Integer, ForeignKey("positions.id"), nullable=False)
    grade_id: Mapped[str] = mapped_column(String(50), ForeignKey("grades.id"), nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    department: Mapped["Department"] = relationship("Department", back_populates="users")
    position: Mapped["Position"] = relationship("Position", back_populates="users")
    grade: Mapped["Grade"] = relationship("Grade", back_populates="users")
    payrolls: Mapped[list["PayrollRecord"]] = relationship("PayrollRecord", back_populates="user", cascade="all, delete-orphan")


class PayrollRecord(Base):
    __tablename__ = "payroll_records"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    period: Mapped[str] = mapped_column(String(20), nullable=False)
    worked_days: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    working_days: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    service_margin: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    goods_margin: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    bonus_percent: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False, default=0)
    service_factor: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False, default=0.5)
    base_salary: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    accrued_base: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    services_bonus: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    goods_bonus: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    bonus_total: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    tax_rate: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False, default=13.0)
    gross_pay: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    tax_amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    net_pay: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    grade_id: Mapped[str] = mapped_column(String(50), ForeignKey("grades.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    user: Mapped["User"] = relationship("User", back_populates="payrolls")
    grade: Mapped["Grade"] = relationship("Grade", back_populates="payrolls")