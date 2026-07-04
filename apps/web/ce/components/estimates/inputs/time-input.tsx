/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
// plane imports
import { convertHoursMinutesToMinutes, convertMinutesToHoursAndMinutes } from "@plane/utils";

export type TEstimateTimeInputProps = {
  value?: number;
  handleEstimateInputValue: (value: string) => void;
};

export function EstimateTimeInput(props: TEstimateTimeInputProps) {
  const { value, handleEstimateInputValue } = props;

  const initial = convertMinutesToHoursAndMinutes(value ?? 0);
  const [hours, setHours] = useState<number>(initial.hours);
  const [minutes, setMinutes] = useState<number>(initial.minutes);

  const emit = (nextHours: number, nextMinutes: number) => {
    const totalMinutes = convertHoursMinutesToMinutes(nextHours, nextMinutes);
    handleEstimateInputValue(totalMinutes.toString());
  };

  const handleHoursChange = (raw: string) => {
    const parsed = Math.max(0, Math.floor(Number(raw) || 0));
    setHours(parsed);
    emit(parsed, minutes);
  };

  const handleMinutesChange = (raw: string) => {
    const parsed = Math.min(59, Math.max(0, Math.floor(Number(raw) || 0)));
    setMinutes(parsed);
    emit(hours, parsed);
  };

  return (
    <div className="flex w-full items-center gap-1 px-2 py-2 text-13">
      <input
        type="number"
        min={0}
        value={hours}
        onChange={(e) => handleHoursChange(e.target.value)}
        className="w-full border-none bg-transparent text-13 focus:border-0 focus:ring-0 focus:outline-none"
        placeholder="0"
        autoFocus
      />
      <span className="text-custom-text-300">h</span>
      <input
        type="number"
        min={0}
        max={59}
        value={minutes}
        onChange={(e) => handleMinutesChange(e.target.value)}
        className="w-full border-none bg-transparent text-13 focus:border-0 focus:ring-0 focus:outline-none"
        placeholder="0"
      />
      <span className="text-custom-text-300">m</span>
    </div>
  );
}
