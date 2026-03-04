export interface ApiResponse<T = unknown> {
  errcode: number;
  errmsg: string;
  data: T;
}

export function resReturn<T>(data: T, errcode = 0, errmsg = '成功！'): ApiResponse<T> {
  return {
    errcode,
    errmsg,
    data
  };
}
