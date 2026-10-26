import { describe, expect, it } from 'vitest';
import { infrastructureData } from './infrastructure-data';

describe('public historical infrastructure figures', () => {
  it('keeps the exercise separate from its publication year', () => {
    expect(infrastructureData.period).toBe(2025);
    expect(infrastructureData.publishedAt).toBe('2026-07-03');
  });
  it('preserves the documented annual values and growth', () => {
    const [volume, revenue, profit] = infrastructureData.metrics;
    expect([volume.value, revenue.value, profit.value]).toEqual([67, 563, 41]);
    expect([volume.growth, revenue.growth]).toEqual([54, 64]);
    expect(profit.prefix).toBe('Mais de R$');
  });
  it('provides a verifiable HTTPS source for every figure', () => {
    for (const metric of infrastructureData.metrics) expect(metric.source).toBe(infrastructureData.source.url);
    expect(new URL(infrastructureData.source.url).protocol).toBe('https:');
  });
  it('explicitly separates provider figures from WiizePay results', () => {
    expect(infrastructureData.disclaimer).toContain('não representam volume transacionado, receita ou lucro da WiizePay');
    expect(infrastructureData.disclaimer).toContain('divulgados em 2026');
  });
});
