import { ajax } from '../lib/api'

export interface LoginRequest {
    username: string
    password: string
}

export interface LoginResponse {
    user: {
        id: number
        username: string
    }
    permissions: string[]
}

export function login(data: LoginRequest) {
    return ajax<LoginResponse>({
        url: '/login',
        method: 'POST',
        data: {...data},
    })
}