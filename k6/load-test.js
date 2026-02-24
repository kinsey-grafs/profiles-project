import { check, sleep } from 'k6';
import http from 'k6/http';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export const options = {
  vus: 5,
  duration: '5m',
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.1'],
  },
};

export default function () {
  const randomName = `item-${Math.random().toString(36).slice(2, 10)}`;

  const resPost = http.post(
    `${BASE_URL}/api/items`,
    JSON.stringify({ name: randomName }),
    { headers: { 'Content-Type': 'application/json' } }
  );
  check(resPost, {
    'POST status 201': (r) => r.status === 201,
  });

  sleep(0.5);

  const resGet = http.get(`${BASE_URL}/api/items`);
  check(resGet, {
    'GET status 200': (r) => r.status === 200,
  });

  sleep(0.5);
}
