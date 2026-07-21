from pydantic import (
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
)

from app.schemas.user import UserRead


class RegisterInput(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )

    email: EmailStr

    password: str = Field(
        min_length=8,
        max_length=128,
    )


class LoginInput(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
    )

    email: EmailStr

    password: str = Field(
        min_length=1,
        max_length=128,
    )


class AuthResponse(BaseModel):
    user: UserRead
    csrf_token: str


class MessageResponse(BaseModel):
    message: str