import React from 'react';
import PropTypes from 'prop-types';
import { useDispatch } from 'react-redux';
import { removeItem } from '../store/cartSlice';
import { formatCurrency } from '../utils/cartHelpers';

// Fallback rendered when a cart item is missing required fields.
function MalformedItemFallback({ item, onRemove }) {
  return (
    <div className="cart-item cart-item--error" role="alert">
      <span className="cart-item__error-msg">
        This item is no longer available{item?.name ? ` (${item.name})` : ''}.
      </span>
      <button
        className="cart-item__remove-btn"
        onClick={onRemove}
        aria-label="Remove unavailable item from cart"
      >
        Remove
      </button>
    </div>
  );
}

MalformedItemFallback.propTypes = {
  item: PropTypes.object,
  onRemove: PropTypes.func.isRequired,
};

export default function CartItem({ item }) {
  const dispatch = useDispatch();

  const handleRemove = () => {
    dispatch(removeItem(item?.id ?? item?.productId ?? null));
  };

  // Guard: item or item.price is missing/invalid — render fallback instead of crashing.
  if (!item || item.price === undefined || item.price === null || typeof item.price !== 'number' || isNaN(item.price)) {
    console.error('[CartItem] Missing or invalid price for item:', item);
    return <MalformedItemFallback item={item} onRemove={handleRemove} />;
  }

  const quantity = typeof item.quantity === 'number' && item.quantity > 0 ? item.quantity : 1;
  const lineTotal = item.price * quantity;

  return (
    <div className="cart-item">
      <img
        className="cart-item__image"
        src={item.imageUrl || '/images/placeholder.png'}
        alt={item.name || 'Product'}
        width={64}
        height={64}
      />
      <div className="cart-item__details">
        <p className="cart-item__name">{item.name || 'Unknown product'}</p>
        <p className="cart-item__sku">SKU: {item.sku || '—'}</p>
      </div>
      <div className="cart-item__pricing">
        <span className="cart-item__unit-price">{formatCurrency(item.price)}</span>
        <span className="cart-item__qty">× {quantity}</span>
        <span className="cart-item__line-total">{formatCurrency(lineTotal)}</span>
      </div>
      <button
        className="cart-item__remove-btn"
        onClick={handleRemove}
        aria-label={`Remove ${item.name || 'item'} from cart`}
      >
        Remove
      </button>
    </div>
  );
}

CartItem.propTypes = {
  item: PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    name: PropTypes.string,
    price: PropTypes.number,
    quantity: PropTypes.number,
    imageUrl: PropTypes.string,
    sku: PropTypes.string,
  }),
};
