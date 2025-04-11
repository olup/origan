export default {
  async fetch() {
    return new Response(`{"message": "Hello from Workers!"}`);
  },
};
