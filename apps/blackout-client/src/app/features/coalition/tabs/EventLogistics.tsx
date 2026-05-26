import React, { useCallback, useEffect, useState, type CSSProperties } from 'react';
import {
    claimRide,
    createRideOffer,
    createVolunteerSlot,
    fetchRideOffers,
    fetchVolunteerSlots,
    volunteerSignup,
    type RideOfferView,
    type VolunteerSlotView,
} from '../coalitionClient';

export interface EventLogisticsProps {
    eventId: string;
    /** When true, show the organizer-only "add slot" control. */
    canManage?: boolean;
}

const sectionStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 };
const rowStyle: CSSProperties = { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' };
const labelStyle: CSSProperties = { fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 };
const inputStyle: CSSProperties = {
    padding: '6px 8px',
    borderRadius: 6,
    border: '1px solid var(--border-default)',
    background: 'var(--bg-input)',
    color: 'var(--text-primary)',
    fontSize: 13,
};
const buttonStyle: CSSProperties = {
    padding: '4px 10px',
    borderRadius: 6,
    border: '1px solid var(--border-default)',
    background: 'transparent',
    color: 'var(--text-primary)',
    cursor: 'pointer',
    fontSize: 13,
};

export default function EventLogistics({ eventId, canManage }: EventLogisticsProps): React.ReactElement {
    const [slots, setSlots] = useState<VolunteerSlotView[]>([]);
    const [offers, setOffers] = useState<RideOfferView[]>([]);
    const [role, setRole] = useState('');
    const [capacity, setCapacity] = useState('1');
    const [origin, setOrigin] = useState('');
    const [seats, setSeats] = useState('1');

    const reload = useCallback(async () => {
        try {
            const [s, o] = await Promise.all([fetchVolunteerSlots(eventId), fetchRideOffers(eventId)]);
            setSlots(s.slots);
            setOffers(o.offers);
        } catch {
            /* surfaced as empty lists */
        }
    }, [eventId]);

    useEffect(() => {
        void reload();
    }, [reload]);

    const addSlot = useCallback(async () => {
        const cap = Number.parseInt(capacity, 10);
        if (!role.trim() || Number.isNaN(cap) || cap < 1) return;
        await createVolunteerSlot(eventId, { role: role.trim(), capacity: cap });
        setRole('');
        setCapacity('1');
        void reload();
    }, [eventId, role, capacity, reload]);

    const toggleSignup = useCallback(
        async (slotId: string, withdraw: boolean) => {
            await volunteerSignup(eventId, slotId, withdraw);
            void reload();
        },
        [eventId, reload],
    );

    const addOffer = useCallback(async () => {
        const total = Number.parseInt(seats, 10);
        if (!origin.trim() || Number.isNaN(total) || total < 1) return;
        await createRideOffer(eventId, { originLabel: origin.trim(), seatsTotal: total });
        setOrigin('');
        setSeats('1');
        void reload();
    }, [eventId, origin, seats, reload]);

    const toggleClaim = useCallback(
        async (offerId: string, release: boolean) => {
            await claimRide(eventId, offerId, release);
            void reload();
        },
        [eventId, reload],
    );

    return (
        <div>
            <div style={sectionStyle}>
                <span style={labelStyle}>Volunteers</span>
                {slots.length === 0 ? <span style={labelStyle}>No volunteer slots yet.</span> : null}
                {slots.map((slot) => (
                    <div key={slot.id} style={rowStyle}>
                        <span style={{ flex: 1, fontSize: 14 }}>
                            {slot.role} · {slot.filled}/{slot.capacity}
                        </span>
                        <button
                            type="button"
                            style={buttonStyle}
                            onClick={() => toggleSignup(slot.id, false)}
                            disabled={slot.remaining <= 0}
                        >
                            Sign up
                        </button>
                        <button type="button" style={buttonStyle} onClick={() => toggleSignup(slot.id, true)}>
                            Withdraw
                        </button>
                    </div>
                ))}
                {canManage ? (
                    <div style={rowStyle}>
                        <input
                            style={inputStyle}
                            placeholder="Role"
                            value={role}
                            onChange={(e) => setRole(e.target.value)}
                        />
                        <input
                            style={{ ...inputStyle, width: 64 }}
                            value={capacity}
                            onChange={(e) => setCapacity(e.target.value)}
                            inputMode="numeric"
                        />
                        <button type="button" style={buttonStyle} onClick={addSlot}>
                            Add slot
                        </button>
                    </div>
                ) : null}
            </div>

            <div style={sectionStyle}>
                <span style={labelStyle}>Rides</span>
                {offers.length === 0 ? <span style={labelStyle}>No ride offers yet.</span> : null}
                {offers.map((offer) => (
                    <div key={offer.id} style={rowStyle}>
                        <span style={{ flex: 1, fontSize: 14 }}>
                            {offer.originLabel} · {offer.seatsRemaining} seat(s) left
                        </span>
                        <button
                            type="button"
                            style={buttonStyle}
                            onClick={() => toggleClaim(offer.id, false)}
                            disabled={offer.seatsRemaining <= 0}
                        >
                            Claim
                        </button>
                        <button type="button" style={buttonStyle} onClick={() => toggleClaim(offer.id, true)}>
                            Release
                        </button>
                    </div>
                ))}
                <div style={rowStyle}>
                    <input
                        style={inputStyle}
                        placeholder="Pickup / origin"
                        value={origin}
                        onChange={(e) => setOrigin(e.target.value)}
                    />
                    <input
                        style={{ ...inputStyle, width: 64 }}
                        value={seats}
                        onChange={(e) => setSeats(e.target.value)}
                        inputMode="numeric"
                    />
                    <button type="button" style={buttonStyle} onClick={addOffer}>
                        Offer ride
                    </button>
                </div>
            </div>
        </div>
    );
}
