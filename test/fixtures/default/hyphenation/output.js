import { __interpolate, __plural, __select } from "precompile-intl-runtime";
export var foot = count => `${__interpolate(count)} ${__plural(count, {
  o: "FOOT",
  h: "FEET"
})}`;
export default {
  nearby: "FIND PLACES NEAR YOUR LOCATION",
  kilometer: (count, gender) => `THIS YEAR ${__select(gender, {
    male: `HE MADE ${__plural(count, {
      0: "NO KILOMETRES",
      1: "ONE KILOMETRE",
      h: `${__interpolate(count)} KILOMETRES`
    })}`,
    female: `SHE MADE ${__plural(count, {
      0: "NO KILOMETRES",
      1: "ONE KILOMETRE",
      h: `${__interpolate(count)} KILOMETRES`
    })}`,
    other: `THEY MADE ${__plural(count, {
      0: "NO KILOMETRES",
      1: "ONE KILOMETRE",
      h: `${__interpolate(count)} KILOMETRES`
    })}`
  })}`,
  foot
};