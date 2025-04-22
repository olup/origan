import { Container, styled } from "@/styled-system/jsx";

const Main = styled("main", {
  base: {
    display: "flex",
    flexDirection: "column",
    // alignItems: "center", // Removed center alignment
    // textAlign: "center", // Removed center alignment
    minHeight: "100vh",
    padding: "6",
    // justifyContent: "center", // Removed vertical centering
  },
});

const Title = styled("h1", {
  base: {
    fontSize: "4xl",
    fontWeight: "bold",
    mb: "4",
  },
});

const SectionTitle = styled("h2", {
  base: {
    fontSize: "2xl",
    fontWeight: "semibold",
    mt: "8", // Add margin top for separation
    mb: "3",
  },
});

const Paragraph = styled("p", {
  base: {
    fontSize: "lg",
    color: "gray.600",
    maxWidth: "600px", // Limit width for readability
    mb: "2", // Add margin bottom between paragraphs
  },
});

const List = styled("ul", {
  base: {
    listStyle: "disc", // Use disc bullets
    paddingLeft: "5", // Indent list
    // textAlign: "left", // Already left-aligned by default
    maxWidth: "600px", // Match paragraph width
    mb: "4",
  },
});

const ListItem = styled("li", {
  base: {
    fontSize: "lg",
    color: "gray.600",
    mb: "1",
  },
});

export default function Home() {
  return (
    <Container>
      <Main>
        <Title>Origan.dev</Title>
        <Paragraph>
          Deploy your web projects instantly on secure, compliant European cloud
          infrastructure. Experience rapid deployments and seamless feedback
          loops while ensuring data sovereignty.
        </Paragraph>
        <Paragraph>
          Focus on building great applications with the peace of mind that your
          data stays within European borders, meeting strict compliance
          requirements.
        </Paragraph>

        <SectionTitle>Key Features</SectionTitle>
        <List>
          <ListItem>Instant Git-based deployments</ListItem>
          <ListItem>Automatic HTTPS and custom domains</ListItem>
          <ListItem>Preview deployments for every push</ListItem>
          <ListItem>Serverless functions and edge computing</ListItem>
          <ListItem>Strictly European-based infrastructure</ListItem>
          <ListItem>Compliance-focused (GDPR, etc.)</ListItem>
        </List>

        <SectionTitle>Ideal Use Cases</SectionTitle>
        <List>
          <ListItem>Static websites and Jamstack applications</ListItem>
          <ListItem>Frontend frameworks (React, Vue, Svelte, etc.)</ListItem>
          <ListItem>Full-stack applications with serverless backends</ListItem>
          <ListItem>Businesses requiring European data residency</ListItem>
          <ListItem>Projects prioritizing GDPR compliance</ListItem>
        </List>
      </Main>
    </Container>
  );
}
