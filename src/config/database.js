import { connect } from 'mongoose';

const database = async () => {
  try {
    await connect(process.env.MONGO_URI || 'mongodb+srv://n8n_user:mongo1234@venue-main.ketzrpm.mongodb.net/?appName=venue-main');
    console.log('MongoDB Connected Successfully');
  } catch (err) {
    console.error('MongoDB Connection Failed:', err.message);
    process.exit(1);
  }
};

export default database;