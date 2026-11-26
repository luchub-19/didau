// T-123: cảnh "bạn là người thứ 5". Tên test viết tiếng Anh (i18n_guard quét landing/**).
// Các khẳng định theo quận ở khối "viewer placed" dựa trên LƯỚI VALHALLA THẬT (T-122, 2026-11-26). Chạy lại
// `scripts/build_landing_data.py` thì phải dò lại các cặp quận → quán (bảng 12 quận ở docs/phase11/DATA.md).
import { describe, expect, it } from 'vitest';
import demoJson from '../../data/demoCase.json';
import gridJson from '../../data/grid.json';
import { DISTRICT_CENTERS, evaluate, farOfPlace } from '../explore';
import type { DemoCaseData, GridData } from '../types';

const demo = demoJson as unknown as DemoCaseData;
const grid = gridJson as unknown as GridData;

describe('T-123 explore: before the viewer joins', () => {
  it('far mode proposes pizza and asks for the viewer (key waiting)', () => {
    const r = evaluate(demo, grid, null, 'far');
    expect(r.pickId).toBe('pizza');
    expect(r.otherPickId).toBe('haidilao');
    expect(r.sentence.key).toBe('waiting');
    expect(r.sentence.diff).toBeUndefined();
    expect(r.estimated).toBe(false);
  });

  it('sum mode proposes haidilao and names the farthest person', () => {
    const r = evaluate(demo, grid, undefined, 'sum');
    expect(r.pickId).toBe('haidilao');
    expect(r.otherPickId).toBe('pizza');
    expect(r.sentence.key).toBe('sum');
    expect(r.sentence.vars).toMatchObject({ who: 'Xeko', min: 74, km: 63.5 });
    expect(r.sentence.diff).toEqual({ place: demo.places[0].name, who: 'Xuka', min: 60 });
  });

  it('rows carry the demo numbers: far 60 / 74 / 94 minutes, totals 68.2 / 63.5 / 81.5 km', () => {
    const r = evaluate(demo, grid, null, 'far');
    expect(r.rows.map((x) => [x.placeId, x.far, x.farWho, x.yourMin])).toEqual([
      ['pizza', 60, 'Xuka', null],
      ['haidilao', 74, 'Xeko', null],
      ['dookki', 94, 'Xuka', null],
    ]);
    expect(r.rows.map((x) => Math.round(x.total * 10) / 10)).toEqual([68.2, 63.5, 81.5]);
  });

  it('farOfPlace reads the farthest member by minutes', () => {
    expect(farOfPlace(demo, 'haidilao')).toEqual({ far: 74, farWho: 'Xeko' });
  });
});

describe('T-123 explore: viewer placed (real grid)', () => {
  it('Go Vap flips the proposal to haidilao and the farthest person stays Xeko', () => {
    const r = evaluate(demo, grid, DISTRICT_CENTERS.gv, 'far');
    expect(r.pickId).toBe('haidilao');
    expect(r.sentence.key).toBe('farOther');
    expect(r.sentence.vars).toMatchObject({ who: 'Xeko', min: 74 });
    expect(r.sentence.vars.yourMin).toBe(r.rows.find((x) => x.placeId === 'haidilao')!.yourMin);
    expect(r.sentence.diff).toBeUndefined(); // both modes agree
  });

  it('Binh Tan: the viewer becomes the farthest person at the proposed place (key farYou)', () => {
    const r = evaluate(demo, grid, DISTRICT_CENTERS.btn, 'far');
    expect(r.pickId).toBe('pizza');
    expect(r.sentence.key).toBe('farYou');
    const pizza = r.rows.find((x) => x.placeId === 'pizza')!;
    expect(pizza.farWho).toBe('you');
    expect(pizza.far).toBe(pizza.yourMin);
    expect(pizza.far).toBeGreaterThan(60);
    expect(r.sentence.diff?.place).toBe(demo.places[1].name); // total km would pick haidilao
  });

  it('Phu Nhuan: pizza stays, viewer is not the farthest', () => {
    const r = evaluate(demo, grid, DISTRICT_CENTERS.pn, 'far');
    expect(r.pickId).toBe('pizza');
    expect(r.sentence.key).toBe('farOther');
    expect(r.sentence.vars.who).toBe('Xuka');
  });

  it('Nha Be: the viewer is the farthest at pizza, and total km would pick dookki', () => {
    const r = evaluate(demo, grid, DISTRICT_CENTERS.nb, 'far');
    expect(r.pickId).toBe('pizza');
    expect(r.sentence.key).toBe('farYou');
    expect(evaluate(demo, grid, DISTRICT_CENTERS.nb, 'sum').pickId).toBe('dookki');
  });

  it('the three districts do not all lead to the same sentence', () => {
    const keys = (['gv', 'btn', 'nb'] as const).map((d) => {
      const r = evaluate(demo, grid, DISTRICT_CENTERS[d], 'far');
      return `${r.pickId}:${r.sentence.key}`;
    });
    expect(new Set(keys).size).toBeGreaterThan(1);
  });

  it('adds the viewer km to the group total', () => {
    const none = evaluate(demo, grid, null, 'far').rows[0].total;
    const r = evaluate(demo, grid, DISTRICT_CENTERS.q1, 'far').rows[0];
    expect(r.total).toBeGreaterThan(none);
  });

  it('viewer outside the grid is flagged as estimated', () => {
    const r = evaluate(demo, grid, [107.08, 10.35], 'far');
    expect(r.estimated).toBe(true);
    expect(r.rows.every((x) => x.yourMin !== null)).toBe(true);
  });

  it('every district chip evaluates to a known place in both modes', () => {
    const ids = demo.places.map((p) => p.id);
    for (const ll of Object.values(DISTRICT_CENTERS)) {
      for (const mode of ['far', 'sum'] as const) {
        const r = evaluate(demo, grid, ll, mode);
        expect(ids).toContain(r.pickId);
        expect(r.ranking[0].id).toBe(r.pickId);
        expect(r.estimated).toBe(false);
      }
    }
  });

  it('diff appears exactly when the two modes propose different places', () => {
    for (const ll of Object.values(DISTRICT_CENTERS)) {
      for (const mode of ['far', 'sum'] as const) {
        const r = evaluate(demo, grid, ll, mode);
        expect(r.sentence.diff !== undefined).toBe(r.pickId !== r.otherPickId);
      }
    }
  });
});
