// Ngôn ngữ chung của luồng ReFix (3 vai): các bước, chữ mô tả, gara xuất phát, nhãn xe ảo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FLOW_STEPS, flowCaption, flowState, partnerTitle, storeLine, stripGara, virtualBadge } from '../src/features/refix/refixFlow.ts';

test('5 bước giống nhau cho khách và nhân viên; đơn hủy không sáng bước nào', () => {
  assert.equal(FLOW_STEPS.length, 5);
  assert.deepEqual(flowState('requested'), { done: 1, current: 1, cancelled: false });
  assert.deepEqual(flowState('assigned'), { done: 2, current: 2, cancelled: false });
  assert.deepEqual(flowState('enroute'), { done: 3, current: 3, cancelled: false });
  assert.deepEqual(flowState('arrived'), { done: 5, current: null, cancelled: false });
  assert.equal(flowState('cancelled').cancelled, true);
});

test('chữ mô tả theo vai, có tên gara', () => {
  assert.equal(flowCaption('enroute', 'customer', 'Gara Minh Tâm'), 'Xe cứu hộ của Gara Minh Tâm đang tới');
  assert.equal(flowCaption('enroute', 'staff', 'Garage Hùng Phát'), 'Xe đang chạy từ Gara Hùng Phát tới khách');
  assert.match(flowCaption('assigned', 'staff'), /Chấp nhận/);
  assert.equal(stripGara('Gara ô tô Minh Tâm'), 'ô tô Minh Tâm');
});

test('gara xuất phát + nhãn xe ảo trung thực + tiêu đề đối tác', () => {
  assert.equal(storeLine({ name: 'Gara A', distanceM: 3400, etaS: 540 }), 'Gara A · cách khách 3,4 km · ~9 phút');
  assert.equal(storeLine(null), '');
  assert.equal(virtualBadge(15), 'XE ẢO · tua nhanh ×15');
  assert.equal(virtualBadge(undefined), 'XE ẢO · demo');
  assert.equal(partnerTitle('Gara Cứu hộ Minh Tâm', 'x'), 'GARA CỨU HỘ MINH TÂM');
  assert.equal(partnerTitle(null, 'Cứu hộ Minh Tâm'), 'CỨU HỘ MINH TÂM');
});
