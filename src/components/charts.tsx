import { useEffect, useRef } from 'react'
import * as echarts from 'echarts/core'
import { BarChart, PieChart, SankeyChart } from 'echarts/charts'
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { EChartsCoreOption } from 'echarts/core'

echarts.use([BarChart, PieChart, SankeyChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer])

/** 轻量 ECharts React 封装：option 变化时 setOption，容器尺寸变化时 resize */
export function Chart({ option, height = 320, className = '' }: { option: EChartsCoreOption; height?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const chartRef = useRef<echarts.ECharts | null>(null)

  useEffect(() => {
    if (!ref.current) return
    const chart = echarts.init(ref.current)
    chartRef.current = chart
    const onResize = () => chart.resize()
    window.addEventListener('resize', onResize)
    const ro = new ResizeObserver(onResize)
    ro.observe(ref.current)
    return () => {
      window.removeEventListener('resize', onResize)
      ro.disconnect()
      chart.dispose()
      chartRef.current = null
    }
  }, [])

  useEffect(() => {
    chartRef.current?.setOption(option, true)
  }, [option])

  return <div ref={ref} style={{ height }} className={className} />
}

export interface SankeyDatum {
  nodes: Array<{ name: string; itemStyle?: { color: string } }>
  links: Array<{ source: string; target: string; value: number }>
}

export function sankeyOption(data: SankeyDatum): EChartsCoreOption {
  return {
    tooltip: { trigger: 'item', triggerOn: 'mousemove' },
    series: [
      {
        type: 'sankey',
        layout: 'none',
        emphasis: { focus: 'adjacency' },
        nodeGap: 12,
        nodeWidth: 14,
        label: { fontSize: 12, color: '#57534e' },
        lineStyle: { color: 'gradient', curveness: 0.5, opacity: 0.35 },
        itemStyle: { borderWidth: 0, borderRadius: 3 },
        data: data.nodes,
        links: data.links,
      },
    ],
  }
}

export function donutOption(data: Array<{ name: string; value: number; itemStyle?: { color: string } }>, showAmount: boolean): EChartsCoreOption {
  return {
    tooltip: {
      trigger: 'item',
      valueFormatter: (v: number) => (showAmount ? `¥${v.toFixed(2)}` : '***'),
    },
    legend: { orient: 'vertical', right: 4, top: 'middle', itemHeight: 10, itemWidth: 10, textStyle: { fontSize: 12, color: '#57534e' } },
    series: [
      {
        type: 'pie',
        radius: ['55%', '82%'],
        center: ['38%', '50%'],
        avoidLabelOverlap: true,
        itemStyle: { borderRadius: 4, borderColor: '#fff', borderWidth: 2 },
        label: { show: false },
        data,
      },
    ],
  }
}

export function trendOption(
  months: string[],
  expense: number[],
  income: number[],
  showAmount: boolean,
): EChartsCoreOption {
  return {
    tooltip: { trigger: 'axis', valueFormatter: (v: number) => (showAmount ? `¥${v.toFixed(2)}` : '***') },
    legend: { top: 0, itemHeight: 10, itemWidth: 14, textStyle: { fontSize: 12, color: '#57534e' } },
    grid: { left: 8, right: 8, top: 32, bottom: 0, containLabel: true },
    xAxis: { type: 'category', data: months, axisTick: { show: false }, axisLine: { lineStyle: { color: '#e7e5e4' } } },
    yAxis: { type: 'value', splitLine: { lineStyle: { color: '#f5f5f4' } }, axisLabel: { formatter: (v: number) => (v >= 10000 ? `${v / 10000}w` : String(v)) } },
    series: [
      { name: '支出', type: 'bar', data: expense, itemStyle: { color: '#6366f1', borderRadius: [4, 4, 0, 0] }, barMaxWidth: 22 },
      { name: '收入', type: 'bar', data: income, itemStyle: { color: '#a7f3d0', borderRadius: [4, 4, 0, 0] }, barMaxWidth: 22 },
    ],
  }
}
