import { connect } from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const database = async () => {
  try {
    await connect(process.env.MONGO_URI);
    console.log('MongoDB Connected Successfully');
  } catch (err) {
    console.error('MongoDB Connection Failed:', err.message);
    process.exit(1);
  }
};

export default database;