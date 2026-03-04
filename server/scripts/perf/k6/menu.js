import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: Number(__ENV.VUS || 20),
  duration: __ENV.DURATION || '60s',
  thresholds: {
    http_req_duration: ['p(95)<500']
  }
};

const baseUrl = __ENV.BASE_URL || 'http://127.0.0.1:3000';
const projectId = __ENV.PROJECT_ID;
const token = __ENV.TOKEN;

if (!projectId) {
  throw new Error('PROJECT_ID is required');
}

export default function() {
  let url = `${baseUrl}/api/interface/list_menu?project_id=${projectId}`;
  if (token) {
    url += `&token=${encodeURIComponent(token)}`;
  }
  const res = http.get(url);
  check(res, {
    'status is 200': r => r.status === 200
  });
  sleep(0.05);
}
