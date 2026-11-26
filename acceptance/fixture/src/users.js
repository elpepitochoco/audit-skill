function deleteUser(data, actor, userId) {
  data.users = data.users.filter((u) => u.id !== userId);
  return data;
}

function setRole(data, actor, userId, role) {
  if (actor.role !== 'admin') throw new Error('forbidden');
  const user = data.users.find((u) => u.id === userId);
  user.role = role;
  console.log(`role change ${userId} -> ${role} by ${actor.id}`);
  return data;
}

module.exports = { deleteUser, setRole };
