import test from 'node:test';
import assert from 'node:assert/strict';
import { orderServices } from '../electron/services/processes';
import type { ServiceProfile } from '../shared/contracts';
function profile(id: string, dependsOn: string[] = []): ServiceProfile {
  return { id, name: id, kind: 'task', directory: '.', command: 'echo example', url: '', environment: {}, dependsOn, evidence: '' };
}
test('服务拓扑排序先启动依赖，避免重复执行共享依赖', () => {
  const result = orderServices([profile('web', ['api']), profile('worker', ['api']), profile('api', ['db']), profile('db')]);
  assert.deepEqual(result.map(s => s.id), ['db', 'api', 'web', 'worker']);
});
test('缺失服务依赖和循环依赖在启动前明确报错', () => {
  assert.throws(() => orderServices([profile('web', ['missing'])]), /不存在/);
  assert.throws(() => orderServices([profile('web', ['api']), profile('api', ['web'])]), /循环/);
});
