import React from 'react';

const Products = ({ products, cartItems, createLineItem, updateLineItem, auth })=> {
  return (
    <div>
      <h2>Products</h2>
      <ul>
        {
          products.map( product => {
            const cartItem = cartItems.find(lineItem => lineItem.product_id === product.id);
            return (
              <li key={ product.id }>
                { product.name }
                {
                  auth.id ? (
                  cartItem ? <button onClick={ ()=> updateLineItem(cartItem)}>Add Another</button>: <button onClick={ ()=> createLineItem(product)}>Add</button>
                  ) : null
                }
              </li>
            );
          })
        }
      </ul>
    </div>
  );
};

export default Products;
