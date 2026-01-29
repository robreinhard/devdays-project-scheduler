'use client';

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import dayjs, { Dayjs } from 'dayjs';

interface DateRangePickerProps {
  startDate?: string;
  endDate?: string;
  onStartDateChange: (date: string | undefined) => void;
  onEndDateChange: (date: string | undefined) => void;
}

const DateRangePicker = ({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
}: DateRangePickerProps) => {
  const handleStartChange = (value: Dayjs | null) => {
    onStartDateChange(value?.format('YYYY-MM-DD'));
  };

  const handleEndChange = (value: Dayjs | null) => {
    onEndDateChange(value?.format('YYYY-MM-DD'));
  };

  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <Box>
        <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
          View Date Range (X-Axis)
        </Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <DatePicker
            label="Start Date"
            value={startDate ? dayjs(startDate) : null}
            onChange={handleStartChange}
            slotProps={{
              textField: { size: 'small', fullWidth: true },
            }}
          />
          <DatePicker
            label="End Date"
            value={endDate ? dayjs(endDate) : null}
            onChange={handleEndChange}
            minDate={startDate ? dayjs(startDate) : undefined}
            slotProps={{
              textField: { size: 'small', fullWidth: true },
            }}
          />
        </Box>
      </Box>
    </LocalizationProvider>
  );
};

export default DateRangePicker;
