export interface Tab {
    id: number;
    name: string;
    type: string;
}

export interface Component extends Tab {
    source: string;
}

export type JsonValue =
    | string
    | number
    | boolean
    | null
    | JsonValue[]
    | { [key: string]: JsonValue };

export type UnaryOperator<T> = (value: T) => T;
