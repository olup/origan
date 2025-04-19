export default {
  async fetch() {
    console.log("Hello from Workers!");

    return new Response(`{"message": "Hello from Workers!"}`);
  },
};
