const pg = require('pg');
const client = new pg.Client(process.env.DATABASE_URL || 'postgres://localhost/the_store_db');
const { v4 } = require('uuid');
const uuidv4 = v4;
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')


const fetchLineItems = async(userId)=> {
  const SQL = `
    SELECT line_items.*
    FROM
    line_items
    JOIN orders
    ON orders.id = line_items.order_id
    JOIN users
    ON users.id = orders.user_id
    WHERE users.id = $1
    ORDER BY product_id
  `;
  const response = await client.query(SQL, [userId]);
  return response.rows;
};

const fetchProducts = async()=> {
  const SQL = `
    SELECT *
    FROM products
  `;
  const response = await client.query(SQL);
  return response.rows;
};

const findUserByToken = async(token) => {
  try {
    const payload = await jwt.verify(token, process.env.JWT)
    const SQL = `
      SELECT id, username
      FROM users
      WHERE id = $1
    `
    const response = await client.query(SQL, [payload.id])
    if(!response.rows.length){
      const error = Error('bad credentials')
      error.status = 401
      throw error
    }

    return response.rows[0]
  } catch (error) {
    console.log(error)
  }
}

const authenticate = async(credentials) => {
  const SQL = `
    SELECT id, password
    FROM users
    WHERE username = $1
  `
  const response = await client.query(SQL, [credentials.username])
  if(!response.rows.length){
    const error = Error('bad credentials')
    error.status = 401
    throw error
  }

  const valid = await bcrypt.compare(credentials.password, response.rows[0].password)
  if(!valid){
    const error = Error('bad credentials')
    error.status = 401
    throw error
  }

  return jwt.sign({id: response.rows[0].id}, process.env.JWT)

}

const createUser = async(user) => {
  if(!user.username.trim() || !user.password.trim()){
    throw Error('must have username and password')
  }
  user.password = await bcrypt.hash(user.password, 5)
  const SQL = `
    INSERT INTO users (id, username, password)
    VALUES ($1, $2, $3)
    RETURNING *
  `
  const response = await client.query(SQL, [uuidv4(), user.username, user.password ])
  return response.rows[0]
}

const createProduct = async(product)=> {
  const SQL = `
    INSERT INTO products (id, name)
    VALUES($1, $2)
    RETURNING *
  `;
  const response = await client.query(SQL, [ uuidv4(), product.name]);
  return response.rows[0];
};

const ensureCart = async(lineItem)=> {
  let orderId = lineItem.order_id;
  if(!orderId){
    const SQL = `
      SELECT order_id 
      FROM line_items 
      WHERE id = $1 
    `;
    const response = await client.query(SQL, [lineItem.id]);
    orderId = response.rows[0].order_id;
  }
  const SQL = `
    SELECT * 
    FROM orders
    WHERE id = $1 and is_cart=true
  `;
  const response = await client.query(SQL, [orderId]);
  if(!response.rows.length){
    throw Error("An order which has been placed can not be changed");
  }
};
const updateLineItem = async(lineItem)=> {
  await ensureCart(lineItem);
  SQL = `
    UPDATE line_items
    SET quantity = $1
    WHERE id = $2
    RETURNING *
  `;
  if(lineItem.quantity <= 0){
    throw Error('a line item quantity must be greater than 0');
  }
  const response = await client.query(SQL, [lineItem.quantity, lineItem.id]);
  return response.rows[0];
};

const createLineItem = async(lineItem)=> {
  await ensureCart(lineItem);
  const SQL = `
  INSERT INTO line_items (product_id, order_id, id) 
  VALUES($1, $2, $3) 
  RETURNING *
`;
 response = await client.query(SQL, [ lineItem.product_id, lineItem.order_id, uuidv4()]);
  return response.rows[0];
};

const deleteLineItem = async(lineItem)=> {
  await ensureCart(lineItem);
  const SQL = `
    DELETE from line_items
    WHERE id = $1
  `;
  await client.query(SQL, [lineItem.id]);
};

const updateOrder = async(order)=> {
  const SQL = `
    UPDATE orders 
    SET is_cart = $1 
    WHERE id = $2 RETURNING *
  `;
  const response = await client.query(SQL, [order.is_cart, order.id]);
  return response.rows[0];
};

const fetchOrders = async(userId)=> {
  const SQL = `
    SELECT * 
    FROM orders
    WHERE user_id = $1;
  `;
  const response = await client.query(SQL, [userId]);
  const cart = response.rows.find(row => row.is_cart);
  if(!cart){
    await client.query('INSERT INTO orders(is_cart, id, user_id) VALUES(true, $1, $2)', 
    [uuidv4(), userId]); 
    return fetchOrders(userId);
  }
  return response.rows;
};

const seed = async()=> {
  const SQL = `
    DROP TABLE IF EXISTS line_items;
    DROP TABLE IF EXISTS products;
    DROP TABLE IF EXISTS orders;
    DROP TABLE IF EXISTS users;

    CREATE TABLE users(
      id UUID PRIMARY KEY,
      created_at TIMESTAMP DEFAULT now(),
      username VARCHAR(100) UNIQUE NOT NULL,
      password VARCHAR(100) NOT NULL
    );

    CREATE TABLE products(
      id UUID PRIMARY KEY,
      created_at TIMESTAMP DEFAULT now(),
      name VARCHAR(100) UNIQUE NOT NULL
    );

    CREATE TABLE orders(
      id UUID PRIMARY KEY,
      created_at TIMESTAMP DEFAULT now(),
      is_cart BOOLEAN NOT NULL DEFAULT true,
      user_id UUID REFERENCES users(id) NOT NULL
    );

    CREATE TABLE line_items(
      id UUID PRIMARY KEY,
      created_at TIMESTAMP DEFAULT now(),
      product_id UUID REFERENCES products(id) NOT NULL,
      order_id UUID REFERENCES orders(id) NOT NULL,
      quantity INTEGER DEFAULT 1,
      CONSTRAINT product_and_order_key UNIQUE(product_id, order_id)
    );

  `;
  await client.query(SQL);

  const [morgan, parker, dylan, devin] = await Promise.all([
    createUser({username: 'morgan', password: '1234'}),
    createUser({username: 'parker', password: 'parkerPass'}),
    createUser({username: 'dylan', password: 'dDawg'}),
    createUser({username: 'devin', password: 'devster'}),
  ])

  const [foo, bar, bazz, quq] = await Promise.all([
    createProduct({ name: 'foo' }),
    createProduct({ name: 'bar' }),
    createProduct({ name: 'bazz' }),
    createProduct({ name: 'quq' }),
  ]);
  let orders = await fetchOrders(morgan.id);
  let cart = orders.find(order => order.is_cart);
  let lineItem = await createLineItem({ order_id: cart.id, product_id: foo.id});
  lineItem.quantity++;
  await updateLineItem(lineItem);
  cart.is_cart = false;
  await updateOrder(cart);
};

module.exports = {
  fetchProducts,
  fetchOrders,
  fetchLineItems,
  createLineItem,
  updateLineItem,
  deleteLineItem,
  updateOrder,
  authenticate,
  findUserByToken,
  seed,
  client
};
