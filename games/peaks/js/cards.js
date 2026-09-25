// Card model shared by every variant. Pure data, no DOM.

export const SUITS = ['spades', 'hearts', 'clubs', 'diamonds'];
export const SUIT_NAMES = ['Spades', 'Hearts', 'Clubs', 'Diamonds'];
export const RANK_LABELS = [null, 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
export const RANK_NAMES = [null, 'Ace', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Jack', 'Queen', 'King'];

export const isRed = (suit) => suit === 1 || suit === 3;

// Builds one card per (suit, rank) for each suit in `suitList`, in order.
// Card ids are their index in the returned array.
export function makeCards(suitList) {
  const cards = [];
  for (const suit of suitList) {
    for (let rank = 1; rank <= 13; rank++) cards.push({ id: cards.length, suit, rank, up: false });
  }
  return cards;
}

export function cardName(card) {
  return `${RANK_NAMES[card.rank]} of ${SUIT_NAMES[card.suit]}`;
}
