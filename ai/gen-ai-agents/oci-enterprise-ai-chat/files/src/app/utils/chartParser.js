/**
 * Parses widget chart data into recharts-compatible format
 */

// Parse semicolon-separated values into array
const parseValues = (str) => {
  if (!str) return [];
  return str.split(";").map(v => {
    const num = parseFloat(v.trim());
    return isNaN(num) ? v.trim() : num;
  });
};

const SUFFIX_MULTIPLIERS = { k: 1e3, m: 1e6, b: 1e9 };

// Parse a chart number the way models tend to write it: "$1,200", "6.84M",
// "753.27K", "12%". Returns NaN when the value isn't a number.
export const parseChartNumber = (raw) => {
  if (typeof raw === "number") return raw;
  const cleaned = String(raw ?? "").trim().replace(/[$€£¥,\s]/g, "").replace(/%$/, "");
  const match = /^(-?\d*\.?\d+)([kmb])?$/i.exec(cleaned);
  if (!match) return NaN;
  const multiplier = SUFFIX_MULTIPLIERS[match[2]?.toLowerCase()] || 1;
  // toPrecision avoids float noise like 6.84 * 1e6 = 6839999.999999999
  return Number((parseFloat(match[1]) * multiplier).toPrecision(12));
};

// Parse semicolon-separated chart values into numbers (null when not numeric,
// so the chart skips the point instead of breaking on a string).
const parseNumbers = (str) => {
  if (!str) return [];
  return str.split(";").map(v => {
    const num = parseChartNumber(v);
    return isNaN(num) ? null : num;
  });
};

// Parse line/bar/area chart data
export const parseSeriesChart = (props) => {
  const labels = parseValues(props.x);
  const series = [];

  // Find all y series (y, y2, y3, etc.)
  Object.keys(props).forEach(key => {
    if (key === "y" || /^y\d+$/.test(key)) {
      let rawValue = props[key];
      let seriesName = null;

      if (rawValue && rawValue.includes(":")) {
        const items = rawValue.split(";");
        if (items.length > 1 && items.every(item => item.includes(":"))) {
          // "Europe:6.84M;Asia:753K" — a label on every value. x already names
          // the points, so keep only the values.
          rawValue = items.map(item => item.slice(item.lastIndexOf(":") + 1)).join(";");
        } else {
          // "Name:value1;value2" — series name prefix
          const colonIdx = rawValue.indexOf(":");
          const beforeColon = rawValue.slice(0, colonIdx);
          // Check if before colon is a name (not a number)
          if (isNaN(parseChartNumber(beforeColon))) {
            seriesName = beforeColon.trim();
            rawValue = rawValue.slice(colonIdx + 1);
          }
        }
      }

      const values = parseNumbers(rawValue);
      const nameKey = key === "y" ? "y_n" : `${key}_n`;
      const explicitName = seriesName || props[nameKey];
      series.push({
        key,
        name: explicitName || (key === "y" ? "Series 1" : `Series ${key.slice(1)}`),
        named: !!explicitName,
        data: values
      });
    }
  });

  // A single unnamed series reads better under the chart title than "Series 1"
  // in the legend (tooltips hide it, see createTooltipFormatter).
  const chartTitle = props.ch_ln || props.ch_br;
  if (series.length === 1 && !series[0].named && chartTitle) {
    series[0].name = chartTitle;
  }

  // Build recharts data format: [{name: "Ene", y: 100, y2: 90}, ...]
  const data = labels.map((label, i) => {
    const point = { name: label };
    series.forEach(s => {
      point[s.key] = s.data[i] ?? 0;
    });
    return point;
  });

  return { data, series };
};

// Parse pie/donut chart data (categorical)
export const parsePieChart = (props) => {
  const data = [];
  const skipKeys = ["ch_pie", "ch_don", "_c", "_colors", "_h", "_legend", "_anim", "n", "n_s", "t", "s", "d", "x", "y"];

  Object.entries(props).forEach(([key, value]) => {
    if (key.startsWith("_") || skipKeys.includes(key)) return;

    // Handle "Name:value" format for pie slices
    let name = key;
    let val = value;

    if (typeof value === "string" && value.includes(":")) {
      // This shouldn't happen for pie charts but handle it anyway
      const parts = value.split(":");
      if (parts.length === 2 && !isNaN(parseChartNumber(parts[1]))) {
        name = parts[0].trim();
        val = parts[1].trim();
      }
    }

    const numValue = parseChartNumber(val);
    if (!isNaN(numValue)) {
      data.push({ name, value: numValue });
    }
  });

  return { data, centerValue: props.n, centerLabel: props.n_s };
};

// Parse gauge data
export const parseGaugeChart = (props) => {
  return {
    value: parseFloat(props.v) || 0,
    max: parseFloat(props.max) || 100,
    target: props.target ? parseFloat(props.target) : null
  };
};

// Parse sparkline (just values)
export const parseSparkline = (value) => {
  return parseNumbers(value).map((v, i) => ({ i, v }));
};

// Tooltip values: 6840000 → "6,840,000"
export const formatChartValue = (value) =>
  typeof value === "number" ? value.toLocaleString() : value;

// Tooltip formatter for series charts. A single unnamed series shows just the
// value under the point's label ("Europe / 6,840,000"); returning a null name
// makes Recharts drop both the name and the " : " separator.
export const createTooltipFormatter = (series) => (value, name) => {
  const hideName = series.length === 1 && !series[0].named;
  return [formatChartValue(value), hideName ? null : name];
};

// Axis ticks: 6840000 → "6.8M"
const compactFormat = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
export const formatChartTick = (value) =>
  typeof value === "number" ? compactFormat.format(value) : value;

// Color palette
export const CHART_COLORS = {
  p: "#C74634", // primary (oracle red)
  s: "#00758F", // secondary (teal)
  b: "#3B82F6", // blue
  g: "#22C55E", // green
  o: "#F59E0B", // orange
  r: "#EF4444", // red
  purple: "#8B5CF6",
  pink: "#EC4899",
};

export const getChartColor = (code) => {
  if (!code) return CHART_COLORS.p;
  if (code.startsWith("#")) return code;
  return CHART_COLORS[code] || CHART_COLORS.p;
};

export const getChartColors = (colorStr) => {
  if (!colorStr) return [CHART_COLORS.p, CHART_COLORS.s, CHART_COLORS.b, CHART_COLORS.g, CHART_COLORS.o];
  return colorStr.split(";").map(c => getChartColor(c.trim()));
};
