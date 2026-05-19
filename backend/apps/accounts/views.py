from ninja import Router
from ninja.errors import HttpError
from django.contrib.auth import authenticate
from .models import User
from .schemas import (
    RegisterIn, LoginIn, TokenOut, TokenRefreshIn, TokenRefreshOut,
    UserOut, ProfileUpdateIn, ChangePasswordIn,
)
from .auth import create_tokens, decode_refresh_token, auth

router = Router(tags=['Auth'])


@router.post('/register/', response=TokenOut, auth=None)
def register(request, data: RegisterIn):
    if User.objects.filter(email=data.email).exists():
        raise HttpError(400, 'Email already registered.')
    if User.objects.filter(username=data.username).exists():
        raise HttpError(400, 'Username already taken.')
    user = User.objects.create_user(
        email=data.email,
        username=data.username,
        first_name=data.first_name,
        last_name=data.last_name,
        company_name=data.company_name,
        password=data.password,
    )
    access, refresh = create_tokens(user.id)
    return {'access': access, 'refresh': refresh, 'user': user}


@router.post('/login/', response=TokenOut, auth=None)
def login(request, data: LoginIn):
    user = authenticate(username=data.email, password=data.password)
    if not user:
        raise HttpError(401, 'Invalid credentials.')
    if not user.is_active:
        raise HttpError(401, 'Account is disabled.')
    access, refresh = create_tokens(user.id)
    return {'access': access, 'refresh': refresh, 'user': user}


@router.post('/logout/', auth=auth)
def logout(request):
    return {'detail': 'Logged out successfully.'}


@router.post('/token/refresh/', response=TokenRefreshOut, auth=None)
def token_refresh(request, data: TokenRefreshIn):
    user_id = decode_refresh_token(data.refresh)
    if not user_id:
        raise HttpError(401, 'Invalid or expired refresh token.')
    access, _ = create_tokens(user_id)
    return {'access': access}


@router.get('/profile/', response=UserOut, auth=auth)
def get_profile(request):
    return request.auth


@router.patch('/profile/', response=UserOut, auth=auth)
def update_profile(request, data: ProfileUpdateIn):
    user = request.auth
    for field, value in data.dict(exclude_none=True).items():
        setattr(user, field, value)
    user.save()
    return user


@router.post('/change-password/', auth=auth)
def change_password(request, data: ChangePasswordIn):
    user = request.auth
    if not user.check_password(data.old_password):
        raise HttpError(400, 'Old password is incorrect.')
    user.set_password(data.new_password)
    user.save()
    return {'detail': 'Password changed successfully.'}
