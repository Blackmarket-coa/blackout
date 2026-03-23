import React, { useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';

export default function ChatScreen() {
  const [text, setText] = useState('');

  return (
    <View>
      <Text>Blackout Chat</Text>
      <TextInput value={text} onChangeText={setText} />
      <TouchableOpacity onPress={() => setText('')}>
        <Text>✈️</Text>
      </TouchableOpacity>
    </View>
  );
}
