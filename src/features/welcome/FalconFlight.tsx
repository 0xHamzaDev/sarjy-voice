export const FalconFlight = () => (
	<div className="intro-falcons" aria-hidden="true">
		{["leading", "trailing", "crossing"].map((bird) => (
			<span className="intro-falcon" key={bird}>
				<svg viewBox="0 0 96 64" focusable="false" aria-hidden="true">
					<g className="intro-falcon-wings">
						<path
							fill="#4e4356"
							d="M54 34H44V30H36V24H28V18H20V12H14V6H24V10H34V14H42V20H50V26H56ZM54 34H46V40H38V46H30V52H22V58H34V54H44V48H52V42H58Z"
						/>
						<path
							fill="#887476"
							d="M50 30H42V24H34V18H26V14H34V18H42V22H50ZM50 38H44V44H36V50H30V54H38V50H46V44H54V38Z"
						/>
					</g>
					<path
						fill="#4e4356"
						d="M14 38H24V34H38V30H54V26H64V20H78V24H86V28H90V34H86V30H80V36H72V40H54V42H34V46H18V42H14Z"
					/>
					<path
						fill="#c4ad83"
						d="M38 34H56V30H66V26H78V30H82V34H72V36H54V38H38ZM22 40H36V42H22Z"
					/>
					<path fill="#887476" d="M40 32H56V34H48V36H40Z" />
					<path fill="#211e32" d="M74 26H78V30H74Z" />
				</svg>
			</span>
		))}
	</div>
);
