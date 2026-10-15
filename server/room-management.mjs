import { randomUUID } from 'node:crypto';

export function tunisDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Tunis', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}

export async function lockRooms(db, roomIds, session) {
  for (const id of [...new Set(roomIds)].sort()) {
    const room = await db.collection('rooms').findOneAndUpdate(
      { id, archived: { $ne: true } },
      { $inc: { rental_lock_version: 1 } },
      { session, returnDocument: 'after', projection: { _id: 0 } },
    );
    if (!room) throw Object.assign(new Error('La chambre sélectionnée n’existe plus ou est archivée.'), { status: 400 });
  }
}

export async function assertRentalAvailability(db, rental, exceptId, session, now = new Date()) {
  const activeRentals = await db.collection('room_rentals').find({
    room_id: rental.room_id,
    archived: { $ne: true },
    ...(exceptId ? { id: { $ne: exceptId } } : {}),
  }, { session }).toArray();
  const today = tunisDate(now);
  const newEnd = rental.actual_departure_date || rental.expected_departure_date;

  for (const existing of activeRentals) {
    if (!existing.actual_departure_date && existing.entry_date <= today) {
      throw Object.assign(new Error('Cette chambre possède déjà une location active. Enregistrez la date de sortie réelle avant d’en créer une autre.'), { status: 409 });
    }
    const existingEnd = existing.actual_departure_date || existing.expected_departure_date;
    if (rental.entry_date <= existingEnd && existing.entry_date <= newEnd) {
      throw Object.assign(new Error('Les dates de cette location chevauchent une autre location de la chambre.'), { status: 409 });
    }
  }
}

export async function assertUtilityPaymentRental(db, rentalId, session) {
  const rental = await db.collection('room_rentals').findOneAndUpdate(
    { id: rentalId, archived: { $ne: true } },
    { $inc: { utility_lock_version: 1 } },
    { session, returnDocument: 'after', projection: { _id: 0 } },
  );
  if (!rental) throw Object.assign(new Error('La location associée est introuvable ou archivée.'), { status: 400 });
}

export function initialRooms(now = new Date()) {
  const timestamp = now.toISOString();
  return Array.from({ length: 14 }, (_, index) => {
    const roomNumber = `Chambre ${String(index + 1).padStart(2, '0')}`;
    return {
      room_number: roomNumber, name: roomNumber, notes: '', archived: false,
      id: randomUUID(), created_at: timestamp, updated_at: timestamp,
    };
  });
}
