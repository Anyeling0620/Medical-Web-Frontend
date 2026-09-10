// ECharts 按需注册模块。
//
// 为什么单独拆一个文件：echarts 的入口是 barrel 模块，只有**静态的具名导入**才能让打包器
// 判断出真正用到哪些导出从而 tree-shake。如果在 echart.tsx 里对 `import("echarts/charts")`
// 的返回值做命名空间访问（如 charts.BarChart），打包器必须保留整个 barrel，
// 会把 Map/Sankey/Treemap 等未使用的图表和 geo 组件一起打进产物（实测约 1MB）。
//
// 本模块只被 echart.tsx 通过动态 import() 引用，因此：
// 1) echarts 不会进入首屏包，只在真正渲染图表时加载；
// 2) 静态具名导入使未使用的图表与组件被完整摇掉。
import { BarChart, PieChart } from "echarts/charts";
import {
	GridComponent,
	LegendComponent,
	TooltipComponent,
} from "echarts/components";
import { init, use } from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";

// 注册本项目用到的图表类型与组件。
// 提示：新增图表类型（如折线、环形以外的图形）时必须在此静态登记，否则运行时不会渲染。
// 注意：TooltipComponent 的字符串 formatter 会对占位符取值做 HTML 转义，
// 若后续改成函数式 formatter 并自行拼接 HTML，必须自己做转义，避免 XSS。
use([
	BarChart,
	PieChart,
	GridComponent,
	TooltipComponent,
	LegendComponent,
	CanvasRenderer,
]);

export { init };
