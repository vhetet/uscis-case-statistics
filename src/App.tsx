import ColorHash from "color-hash";
import Immutable from "immutable";
import nullthrows from "nullthrows";
import React, { useEffect, useState, useMemo } from "react";
import * as lodash from "lodash";


import {
  Bar,
  BarChart,
  CartesianGrid,
  ContentRenderer,
  Tooltip,
  XAxis,
  YAxis,
  TooltipProps,
} from "recharts";
import FormControl from "@material-ui/core/FormControl";
import FormControlLabel from "@material-ui/core/FormControlLabel";
import FormLabel from "@material-ui/core/FormLabel";
import Grid from "@material-ui/core/Grid";
import Radio from "@material-ui/core/Radio";
import RadioGroup from "@material-ui/core/RadioGroup";
import Slider from "@material-ui/core/Slider";


type FY = "20" | "21";
const statusMap = new Map([
  ["Case Was Approved And My Decision Was Emailed", "Case Was Approved"],
  ["Case Was Received and A Receipt Notice Was Emailed", "Case Was Received"],
  ["Case Was Received and A Receipt Notice Was Sent", "Case Was Received"],
  [
    "Request for Initial Evidence Was Sent",
    "Request for Additional Evidence Was Sent",
  ],
  [
    "Case Was Transferred And A New Office Has Jurisdiction",
    "Case Transferred And New Office Has Jurisdiction",
  ],
]);

function getColor(s: string): string {
  return (
    Immutable.Map([
      ["Case Was Received", "#999900"],
      ["Case Was Approved", "#00FF00"],
      ["Request for Additional Evidence Was Sent", "#FF0000"],
    ]).get(s) ?? new ColorHash().hex(s)
  );
}

const App: React.FC<{}> = () => {
  const selectedForm =
    new URL(window.location.href).searchParams.get("form") ?? "I-765";
  const selectedCenter =
    new URL(window.location.href).searchParams.get("center") ?? "LIN";
  const mode = new URL(window.location.href).searchParams.get("mode") ?? "data_center_year_code_day_serial";
  const selectedFy = new URL(window.location.href).searchParams.get("fy");

  const [selectedUpdateDay, setSelectedUpdateDay] = useState<string | null>(
    null
  );
  const [caseData, setCaseData] = useState<{ [key: string]: { [day: string]: number; }; }>({});
  const [transitioningData, setTransitioningData] = useState<{ [day: string]: { [index: string]: number; }; }>({});


  const setSearchParam = (key: string, value: string) => {
    const url = new URL(window.location.href);
    const searchParams = url.searchParams;
    searchParams.set(key, value);
    url.search = searchParams.toString();
    window.location.href = url.toString();
  };

  const url = new URL(window.location.href);

  useEffect(() => {
    (async () => {
      if (!url.searchParams.get("fy")) {
        setSearchParam("fy", "21");
      }
      if (!url.searchParams.get("form")) {
        setSearchParam("form", "I-131");
      }
      if (!url.searchParams.get("center")) {
        setSearchParam("center", "LIN");
      }
      if (!url.searchParams.get("mode") && url.searchParams.get("form")) {
        setSearchParam("mode", ["I-485", "I-140"].includes(url.searchParams.get("form")!) ? "data_center_year_code_day_serial" : "data_center_year_day_code_serial");
      }
      if (url.searchParams.get("form") && url.searchParams.get("center") && url.searchParams.get("mode")) {
        if (url.searchParams.get("t_delta") === "7") {
          setTransitioningData((await (await import('./scraper/transitioning_7.json')).default));
        } else {
          setTransitioningData((await (await import('./scraper/transitioning_1.json')).default));
        }
        if (mode === 'data_center_year_code_day_serial') {
          setCaseData(((await import('./scraper/data_center_year_code_day_serial_' + selectedFy + '.json')).default));
        } else {
          setCaseData(((await import('./scraper/data_center_year_day_code_serial_' + selectedFy + '.json')).default));
        }
      }
    })();
  }, [mode, selectedFy, url.searchParams]);

  const entries = useMemo(() => {
    return Immutable.List(
      Object.entries(caseData).flatMap(([key, counts]) => {
        const [center, year, day, code, form, status] = key.split("|");
        return Object.entries(counts).map((count) => {
          return {
            center,
            year,
            day,
            code,
            form,
            status,
            updateDay: count[0] as string,
            count: count[1] as number,
          };
        });
      })
    )
      .groupBy(
        (v) =>
          v.center +
          v.year +
          v.day +
          v.code +
          v.form +
          (statusMap.get(v.status) ?? v.status) +
          v.updateDay
      )
      .map((v) => v.toList().toArray())
      .map((v) => {
        return {
          center: v[0].center,
          year: v[0].year,
          day: v[0].day,
          code: v[0].code,
          form: v[0].form,
          status: statusMap.get(v[0].status) ?? v[0].status,
          updateDay: v[0].updateDay,
          count: lodash.sumBy(v, (v) => v.count) as number,
        };
      })
      .toList();
  }, [caseData]);


  const selectedEntriesAllDate = useMemo(
    () =>
      entries.filter(
        (e) => e.form === selectedForm && e.center === selectedCenter
      ),
    [entries, selectedForm, selectedCenter]
  );

  const availableUpdateDays = useMemo(
    () =>
      selectedEntriesAllDate
        .map((e) => Number.parseInt(e.updateDay))
        .toSet()
        .toList()
        .sort(),
    [selectedEntriesAllDate]
  );


  const latestUpdateDay = useMemo(
    () => selectedEntriesAllDate.map((e) => Number.parseInt(e.updateDay)).max(),
    [selectedEntriesAllDate]
  );

  const selectedEntries = useMemo(
    () =>
      selectedEntriesAllDate.filter(
        (e) =>
          e.updateDay === (selectedUpdateDay ?? latestUpdateDay)?.toString()
      ),
    [selectedEntriesAllDate, selectedUpdateDay, latestUpdateDay]
  );

  const formTypes = useMemo(() => entries.map((e) => e.form).toSet()
    .filter(e => e && e.length > 0), [
    entries,
  ]);
  const centerNames = useMemo(() => entries.map((e) => e.center).toSet()
    .filter(e => e && e.length > 0 && e !== 'default'), [
    entries,
  ]);

  const statusCount = useMemo(
    () => selectedEntriesAllDate.countBy((x) => x.status),
    [selectedEntriesAllDate]
  );
  const existStatus = useMemo(
    () =>
      selectedEntriesAllDate
        .map((e) => e.status)
        .toSet()
        .toList()
        .sortBy((s) => -(statusCount.get(s) ?? 0)),
    [selectedEntriesAllDate, statusCount]
  );

  const exisitDays = useMemo(
    () =>
      selectedEntriesAllDate
        .map((e) => Number.parseInt(e.day))
        .toSet()
        .toList()
        .sort(),
    [selectedEntriesAllDate]
  );

  const dataset = useMemo(
    () =>
      selectedEntries
        .groupBy((e) => e.day)
        .map((e, day) => {
          return {
            day,
            ...e
              .reduce(
                (counter, v) => counter.set(v.status, v.count),
                Immutable.Map<string, number>()
              )
              .toObject(),
          };
        })
        .toList()
        .sort((a, b) => Number.parseInt(a.day) - Number.parseInt(b.day))
        .toArray(),
    [selectedEntries]
  );

  const previousDayCount = useMemo(
    () =>
      selectedEntriesAllDate
        .filter(
          (v) =>
            v.updateDay ===
            (Number.parseInt((selectedUpdateDay ?? latestUpdateDay)?.toString() ?? "0") - 1).toString()
        )
        .groupBy((v) => v.day)
        .map((v) =>
          Immutable.Map(
            // @ts-ignore
            v.map((x) => [x.status.toString(), x.count]).toArray()
          )
        ),
    [selectedEntriesAllDate, selectedUpdateDay, latestUpdateDay]
  );

  const todayCount = useMemo(
    () =>
      selectedEntriesAllDate
        .filter(
          (v) =>
            v.updateDay === (selectedUpdateDay ?? latestUpdateDay)?.toString()
        )
        .groupBy((v) => v.day)
        .map((v) =>
          Immutable.Map(
            // @ts-ignore
            v.map((x) => [x.status.toString(), x.count]).toArray()
          )
        ),
    [selectedEntriesAllDate, selectedUpdateDay, latestUpdateDay]
  );

  const datasetWithBackfill = useMemo(
    () =>
      exisitDays
        .map(
          (day) =>
            dataset.find((v) => v.day === day.toString()) ?? {
              day: day.toString(),
            }
        )
        .toArray()
        .slice(200, 240),
    [exisitDays, dataset]
  );

  const totalCountToday: Map<String, number> = new Map();
  for (const cnt of datasetWithBackfill) {
    for (const [k, v] of Object.entries(cnt)) {
      if (k === 'day') continue;
      totalCountToday.set(k, Number.parseInt(v) + (totalCountToday.get(k) ?? 0));
    }
  }

  const all = false;
  const processedTransitioningData = Immutable.List(all ?
    Object.values(transitioningData).map(v => Object.entries(v)).flat() :
    Object.entries(transitioningData[(selectedUpdateDay ?? latestUpdateDay) ?? ""] ?? {}))
    .map(([key, count]) => {
      const [format, form, center, year, code, day, from, to] = key.split("|");
      return { format, form, center, year, code, day, from, to, count };
    })
    .filter(trans => trans.year === selectedFy && trans.center === selectedCenter && trans.form === selectedForm && ("data_" + trans.format) === url.searchParams.get("mode"))
    .groupBy(trans => trans.from + trans.to)
    .toMap()
    .map(v => v.valueSeq().toList())
    .valueSeq()
    .toList()
    .map(trans => {
      return {
        from: trans.get(0)!.from,
        to: trans.get(0)!.to,
        count: lodash.sumBy(trans.toArray(), t => t.count)
      };
    })
    .toArray();

  const Transitioning = <div>
    {processedTransitioningData.sort((a, b) => b.count - a.count)
      .map((trans, i) => {
        return <div key={i}>
          <div style={{ color: getColor(trans.from), display: 'inline' }}>{trans.from}</div>
          <b>{" => "}</b>
          <div style={{ color: getColor(trans.to), display: 'inline' }}>{trans.to}</div>
          <b>{" : " + trans.count}</b></div>;
      })}
  </div>;


  const sumToday = lodash.sum(Array.from(totalCountToday.values()));
  const TotalCountToday = <div>
    <h3>Total for {selectedCenter} and {selectedForm} on your selected date</h3>
    <h4>Transitioning</h4>
    {Transitioning}
    <br />
    <h4>Total Counts:</h4>
    {Array.from(totalCountToday).sort((a, b) => b[1] - a[1]).map(([k, v], i) => <div key={i} style={{ color: getColor(k as string) }}>
      {k} : {v}, {(v * 100 / sumToday).toFixed(2)}%
    </div>)}
    <div><b>Total: {sumToday}</b></div>
  </div>;


  const maxBarHeight = useMemo(
    () =>
      todayCount.valueSeq().map(v => lodash.sum(v.valueSeq().toArray())).max(),
    [todayCount]
  );

  const barChart = useMemo(() => {
    const CustomTooltip: ContentRenderer<TooltipProps> = ({
      payload,
      label,
    }) => {
      const todayTotal =
        todayCount
          .get(label as string)
          ?.reduce((a, b) => a + (b as number), 0) ?? 1;
      const prevdayTotal =
        previousDayCount
          .get(label as string)
          ?.reduce((a, b) => a + (b as number), 0) ?? 1;

      return (
        <div style={{ backgroundColor: "#F0F8FF" }}>
          <p>{`${label}`}</p>
          {(payload ?? []).map((p, ind) => {
            const prevDay = (previousDayCount
              .get(label as string)
              ?.get(p.dataKey as string) ?? 0) as number;
            return (
              <p key={ind} style={{ color: p.fill, marginBottom: "3px" }}>{`${p.dataKey
                }: ${p.value} of ${todayTotal} (${(
                  (100 * (p.value as number)) /
                  todayTotal
                ).toFixed(
                  2
                )}%), Previous day: ${prevDay} of ${prevdayTotal},  (${(
                  (100 * prevDay) /
                  prevdayTotal
                ).toFixed(2)}%)`}</p>
            );
          })}
        </div>
      );
    };

    return (
      <BarChart
        height={840}
        width={1410}
        data={datasetWithBackfill}
        layout="vertical"
      >
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis
          type="number"
          dataKey="day"
          domain={[0, maxBarHeight ?? 1]}
        />
        <YAxis
          type="category"
          dataKey="day"
          width={150}
          tickFormatter={day => mode === 'data_center_year_code_day_serial' ? selectedCenter + selectedFy + "9" + day.toString().padStart(3, "0") + "XXXX" : selectedCenter + selectedFy + day.toString().padStart(3, "0") + "5XXXX"}
          domain={[(exisitDays.min() ?? 0) - 1, (exisitDays.max() ?? 1) + 1]}
          tick={{ fontSize: "6" }}
          interval={0}
          allowDecimals={true}
          ticks={exisitDays.toArray()}
        />
        <Tooltip
          offset={100}
          content={CustomTooltip}
          itemSorter={(a) =>
            -existStatus.indexOf(nullthrows(a.dataKey) as string)
          }
        />
        {existStatus.toArray().map((s, ind) => (
          <Bar
            key={ind}
            isAnimationActive={false}
            dataKey={s}
            stackId="a"
            fill={getColor(s)}
          />
        ))}
      </BarChart>
    );
  }, [datasetWithBackfill, maxBarHeight, exisitDays, existStatus, todayCount, previousDayCount, mode, selectedCenter, selectedFy]);

  const introduction = (
    <div>
      <h1>USCIS case progress tracker</h1>
      <p>
        Current Form: <strong>{selectedForm}</strong>,<br /> location:{" "}
        <strong>{selectedCenter}</strong>,
        <br />
        Case number mode: <strong>{mode}</strong>
        <br /> Last Update for this form and
        location:
        <strong>
          {latestUpdateDay
            ? new Date(
              86400000 * latestUpdateDay + 3600 * 1000 * 7
            ).toDateString()
            : "Not Exist currently"}
        </strong>
      </p>
    </div>
  );

  const updateDayPicker = availableUpdateDays.max() ? (
    <Grid item xs={8}>
      <Slider
        style={{ marginLeft: "128px", marginRight: "128px" }}
        defaultValue={availableUpdateDays.max() ?? 1}
        onChange={(_, f) => setSelectedUpdateDay(f.toString())}
        aria-labelledby="discrete-slider"
        valueLabelDisplay="off"
        step={null}
        marks={availableUpdateDays
          .map((e) => ({
            value: e,
            label:
              1 +
              new Date(86400000 * e + 3600 * 1000 * 7).getMonth() +
              "/" +
              new Date(86400000 * e + 3600 * 1000 * 7).getDate(),
          }))
          .toArray()}
        min={availableUpdateDays.min() ?? 0}
        max={availableUpdateDays.max() ?? 1}
      />
    </Grid>
  ) : null;


  const formTypeSelector = (
    <FormControl fullWidth={true} component="fieldset">
      <RadioGroup
        aria-label="form"
        name="form"
        value={selectedForm}
        onChange={(e) => setSearchParam("form", e.target.value)}
        row={true}
      >
        {formTypes
          .toArray()
          .sort()
          .map((f, ind) => (
            <FormControlLabel
              key={ind}
              value={f}
              control={<Radio />}
              label={f}
            />
          ))}
      </RadioGroup>
    </FormControl>
  );



  const centerSelector = (
    <FormControl fullWidth={true} component="fieldset">
      <FormLabel component="legend">Center</FormLabel>
      <RadioGroup
        aria-label="form"
        name="form"
        value={selectedCenter}
        onChange={(e) => setSearchParam("center", e.target.value)}
        row={true}
      >
        {centerNames
          .toArray()
          .sort()
          .map((f, ind) => (
            <FormControlLabel
              key={ind}
              value={f}
              control={<Radio />}
              label={f}
            />
          ))}
      </RadioGroup>
    </FormControl>
  );


  return (
    <div>
      {introduction}
      {formTypeSelector}
      {centerSelector}
      {updateDayPicker}
      {barChart}
      {updateDayPicker}
      {TotalCountToday}
    </div>
  );
};

export default App;
