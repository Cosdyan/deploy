import decodeJwt from "jwt-decode";
import { useReducerAtom, atomWithStorage } from 'jotai/utils'

interface AuthPermissions {
    is_superuser?: boolean;
    is_ops?: boolean;
    user_id?: number;
}

export interface AuthState {
    token: string;
    permissions: AuthPermissions | '';
}

interface DecodedToken {
    permissions: AuthPermissions | "admin" | "ops" | "user";
    [key: string]: unknown;
}

type AuthAction =
    | { type: 'login'; payload: { access_token: string } }
    | { type: 'logout' };

const authReducer = (prev: AuthState, action: AuthAction): AuthState => {
    if (action.type === 'login') {
        const decodedToken = decodeJwt<DecodedToken>(action.payload["access_token"]);
        // TODO: Maybe throw error here
        return {
            token: action.payload["access_token"],
            permissions: typeof decodedToken.permissions === "string" ? {is_superuser: decodedToken.permissions === "admin", is_ops: decodedToken.permissions === "ops"} : decodedToken.permissions
        }
    } else if (action.type === 'logout') {
        return {
            token: '',
            permissions: ''
        }
    } else {
        throw new Error(`unhandled action type: ${(action as { type: string }).type}`)
    }
}
export const authAtom = atomWithStorage<AuthState>('auth', {
    token: '',
    permissions: '',
})

export const useAuthReducer = () => {
    const [auth, dispatch] = useReducerAtom(authAtom, authReducer)
    return {
        auth: { ...auth, permissions: typeof auth.permissions === "string" && auth.permissions ? { is_superuser: auth.permissions === ("admin" as string), is_ops: auth.permissions === ("ops" as string) } : auth.permissions },
        login: (response: { access_token: string }) => dispatch({ type: 'login', payload: response }),
        logout: () => dispatch({ type: 'logout' }),
    }
}
