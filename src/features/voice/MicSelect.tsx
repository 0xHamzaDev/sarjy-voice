type MicSelectProps = {
	mics: MediaDeviceInfo[];
	value: string;
	onChange: (deviceId: string) => void;
	label: string;
	defaultLabel: string;
	id?: string;
};

export const MicSelect = ({
	mics,
	value,
	onChange,
	label,
	defaultLabel,
	id,
}: MicSelectProps) => (
	<select
		id={id}
		className="mic-select"
		value={value}
		aria-label={label}
		onChange={(event) => onChange(event.target.value)}
	>
		<option value="">{defaultLabel}</option>
		{mics.map((mic, index) => (
			<option key={mic.deviceId} value={mic.deviceId}>
				{mic.label || `${label} ${index + 1}`}
			</option>
		))}
	</select>
);
