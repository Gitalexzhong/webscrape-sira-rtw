import React from "react";
import { CssBaseline, Container, Box, Typography } from "@mui/material";
import { useState } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import './App.css'
import MapView from "./MapView";

function App() {
  const [count, setCount] = useState(0)

  return (
    <>
      <CssBaseline />
      <Container maxWidth="xl">
        <Box my={2}>
          <Typography variant="h4" gutterBottom>
            SIRA Provider Map
          </Typography>
          <MapView />
        </Box>
      </Container>
    </>
  );
}

export default App;
