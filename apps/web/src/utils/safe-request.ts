import { getRequestErrorMessage } from './request-error';

type ApiLikeResponse = {
  errcode?: number;
  errmsg?: string;
};

type SafeApiRequestOptions = {
  fallback: string;
  onError: (message: string) => void;
};

export async function safeApiRequest<T extends ApiLikeResponse>(
  request: Promise<T>,
  options: SafeApiRequestOptions
): Promise<T | null> {
  try {
    const response = await request;
    if (typeof response.errcode === 'number' && response.errcode !== 0) {
      options.onError(response.errmsg || options.fallback);
      return null;
    }
    return response;
  } catch (error) {
    options.onError(getRequestErrorMessage(error, options.fallback));
    return null;
  }
}
