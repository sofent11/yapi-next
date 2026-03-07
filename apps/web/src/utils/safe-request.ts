import { getRequestErrorMessage } from './request-error';

type ApiLikeResponse = {
  errcode?: number;
  errmsg?: string;
};

type SafeApiRequestOptions = {
  fallback: string;
  onError: (message: string) => void;
};

function isApiLikeResponse(value: unknown): value is ApiLikeResponse {
  return value !== null && typeof value === 'object' && ('errcode' in value || 'errmsg' in value);
}

export async function safeApiRequest<T>(
  request: Promise<T>,
  options: SafeApiRequestOptions
): Promise<T | null> {
  try {
    const response = await request;
    if (isApiLikeResponse(response) && typeof response.errcode === 'number' && response.errcode !== 0) {
      options.onError(response.errmsg || options.fallback);
      return null;
    }
    return response;
  } catch (error) {
    options.onError(getRequestErrorMessage(error, options.fallback));
    return null;
  }
}
