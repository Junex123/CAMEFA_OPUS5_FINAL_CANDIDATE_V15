export interface RateLimiterPort { admit(input:any):Promise<any>; settle(input:any):Promise<void>; }
