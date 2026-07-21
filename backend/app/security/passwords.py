from pwdlib import PasswordHash


password_hash = PasswordHash.recommended()


# Dùng khi email không tồn tại để vẫn thực hiện
# một password verification, giảm khác biệt timing
# quá rõ giữa "email tồn tại" và "email không tồn tại".
DUMMY_PASSWORD_HASH = password_hash.hash(
    "dummy-password-that-is-never-used"
)


def hash_password(password: str) -> str:
    return password_hash.hash(password)


def verify_password(
    plain_password: str,
    hashed_password: str,
) -> bool:
    return password_hash.verify(
        plain_password,
        hashed_password,
    )


def perform_dummy_verify(password: str) -> None:
    password_hash.verify(
        password,
        DUMMY_PASSWORD_HASH,
    )