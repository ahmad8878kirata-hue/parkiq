import { X, CaretLeft, CaretRight, CalendarBlank, Pencil } from '@phosphor-icons/react';

const MONTH_NAMES = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
const FULL_MONTH_NAMES = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();
const firstDayOfMonth = (y, m) => new Date(y, m, 1).getDay();

const DateTimePicker = ({
    activeDay, setActiveDay,
    month, setMonth,
    year, setYear,
    time, setTime,
    showCalendar, setShowCalendar,
    onSave,
    showTimeConfirmBadge = false,
    onTimeConfirmBadgeShow,
}) => {
    const today = new Date();

    const prevMonth = () => {
        if (month === 0) { setMonth(11); setYear(y => y - 1); }
        else setMonth(m => m - 1);
    };
    const nextMonth = () => {
        if (month === 11) { setMonth(0); setYear(y => y + 1); }
        else setMonth(m => m + 1);
    };

    const isPastDay = (day) => {
        const d = new Date(year, month, day);
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        return d < now;
    };

    const renderDays = () => {
        const days = [];
        const dim = daysInMonth(year, month);
        const fdow = firstDayOfMonth(year, month);
        const prevDim = daysInMonth(year, month - 1 < 0 ? 11 : month - 1);

        for (let i = fdow === 0 ? 6 : fdow - 1; i > 0; i--) {
            days.push(<div key={`prev-${i}`} className="day disabled">{prevDim - i + 1}</div>);
        }
        for (let i = 1; i <= dim; i++) {
            const past = isPastDay(i);
            days.push(
                <div
                    key={`curr-${i}`}
                    className={`day ${past ? 'disabled' : ''} ${activeDay === i ? 'active' : ''}`}
                    onClick={() => { if (!past) setActiveDay(i); }}
                >
                    {i.toString().padStart(2, '0')}
                </div>
            );
        }
        return days;
    };

    const openCalendar = () => setShowCalendar(true);

    return (
        <>
            {!showCalendar ? (
                showTimeConfirmBadge ? (
                    <div className="time-confirmed-badge">
                        <span className="time-confirmed-label">
                            {activeDay === today.getDate() && month === today.getMonth() && year === today.getFullYear()
                                ? `Heute, ${time}`
                                : `${FULL_MONTH_NAMES[month].slice(0, 3)} ${activeDay}, ${time}`}
                        </span>
                        <button className="time-edit-btn" onClick={() => { onTimeConfirmBadgeShow?.(); openCalendar(); }}>
                            <Pencil weight="bold" size={14} />
                        </button>
                    </div>
                ) : (
                    <button className="btn btn-outline date-btn" onClick={openCalendar}>
                        <CalendarBlank weight="bold" size={18} />
                        <span>Datum &amp; Uhrzeit festlegen</span>
                        <span className="date-btn-value">{FULL_MONTH_NAMES[month].slice(0, 3)} {activeDay}, {time}</span>
                    </button>
                )
            ) : (
                <>
                    <div className="dt-close-row">
                        <button className="icon-btn close-btn" onClick={() => setShowCalendar(false)}>
                            <X weight="bold" />
                        </button>
                    </div>
                    <div className="datetime-content">
                        <div className="calendar-header">
                            <button className="icon-btn text-muted" onClick={prevMonth}>
                                <CaretLeft weight="bold" /> {month === 0 ? MONTH_NAMES[11] : MONTH_NAMES[month - 1]}
                            </button>
                            <span className="current-month">{FULL_MONTH_NAMES[month]} {year}</span>
                            <button className="icon-btn text-muted" onClick={nextMonth}>
                                {month === 11 ? MONTH_NAMES[0] : MONTH_NAMES[month + 1]} <CaretRight weight="bold" size={32} />
                            </button>
                        </div>

                        <div className="calendar-grid">
                            <div className="day-name">Mo</div><div className="day-name">Di</div><div className="day-name">Mi</div><div className="day-name">Do</div><div className="day-name">Fr</div><div className="day-name">Sa</div><div className="day-name">So</div>
                            {renderDays()}
                        </div>

                        <div className="time-picker mb-4">
                            <label className="time-label" htmlFor="departure-time-input">Abfahrtszeit</label>
                            <input
                                id="departure-time-input"
                                type="time"
                                value={time}
                                onChange={(e) => setTime(e.target.value)}
                                className="time-input"
                                step="60"
                            />
                            <span className="time-unit">Uhr</span>
                            <button className="btn btn-outline ml-auto now-btn" onClick={() => {
                                const now = new Date();
                                setTime(`${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`);
                                setActiveDay(now.getDate());
                            }}>Jetzt</button>
                        </div>
                        <button className="btn btn-primary w-100 set-date-btn" onClick={onSave}>
                            <span style={{ marginRight: '0.4rem' }}>✔</span> Speichern
                        </button>
                    </div>
                </>
            )}
        </>
    );
};

export default DateTimePicker;
