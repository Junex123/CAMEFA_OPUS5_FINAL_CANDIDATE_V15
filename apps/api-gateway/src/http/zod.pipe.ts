import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common'; import type { ZodType } from 'zod';
@Injectable() export class ZodPipe<T> implements PipeTransform<unknown,T>{constructor(private readonly schema:ZodType<T>){ } transform(value:unknown):T{const p=this.schema.safeParse(value);if(!p.success)throw new BadRequestException(p.error.issues);return p.data}}
