export class HttpError extends Error {
  constructor(public status: number, public code: string, message?: string) {
    super(message ?? code);
  }
}
export const badRequest = (code: string, msg?: string) => new HttpError(400, code, msg);
export const unauthorized = (code: string, msg?: string) => new HttpError(401, code, msg);
export const forbidden = (code: string, msg?: string) => new HttpError(403, code, msg);
export const notFound = (code: string, msg?: string) => new HttpError(404, code, msg);
export const conflict = (code: string, msg?: string) => new HttpError(409, code, msg);
export const internal = (code: string, msg?: string) => new HttpError(500, code, msg);
